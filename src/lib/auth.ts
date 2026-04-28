import { NextAuthOptions } from 'next-auth';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import GitHubProvider from 'next-auth/providers/github';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getEnv } from './env';
import { logger } from './logger';
import { db } from './db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const env = getEnv();

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(db),
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
  pages: {
    signIn: '/sign-in',
    signUp: '/sign-up',
    error: '/auth/error',
    verifyRequest: '/auth/verify-request',
    newUser: '/chat',
  },
  providers: [
    ...(env.GITHUB_ID && env.GITHUB_SECRET
      ? [
          GitHubProvider({
            clientId: env.GITHUB_ID,
            clientSecret: env.GITHUB_SECRET,
            profile(profile) {
              return {
                id: profile.id.toString(),
                name: profile.name || profile.login,
                email: profile.email,
                image: profile.avatar_url,
                role: 'user',
              };
            },
          }),
        ]
      : []),
    ...(env.VERCEL_ID && env.VERCEL_SECRET
      ? [
          {
            id: 'vercel',
            name: 'Vercel',
            type: 'oauth' as const,
            clientId: env.VERCEL_ID,
            clientSecret: env.VERCEL_SECRET,
            authorization: {
              url: 'https://vercel.com/oauth/authorize',
              params: { scope: 'openid email' },
            },
            token: 'https://api.vercel.com/v2/oauth/access_token',
            userinfo: 'https://api.vercel.com/www/user',
            profile(profile: any) {
              return {
                id: profile.user?.uid || profile.sub,
                name: profile.user?.name || profile.name,
                email: profile.user?.email || profile.email,
                image: profile.user?.avatar || profile.picture,
                role: 'user',
              };
            },
          },
        ]
      : []),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          logger.warn('Login attempt missing credentials');
          return null;
        }

        try {
          const user = await db.query.users.findFirst({
            where: eq(users.email, credentials.email.toLowerCase()),
          });

          if (!user) {
            logger.warn('Login attempt for non-existent user', { email: credentials.email });
            return null;
          }

          if (user.isBanned) {
            logger.warn('Login attempt by banned user', { userId: user.id });
            throw new Error('Account suspended');
          }

          if (!user.passwordHash) {
            logger.warn('Login attempt without password auth', { userId: user.id });
            return null;
          }

          const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
          
          if (!isValid) {
            logger.warn('Failed login attempt', { userId: user.id });
            return null;
          }

          logger.info('User authenticated', { userId: user.id, role: user.role });

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            role: user.role,
          };
        } catch (error) {
          logger.error('Authentication error', error as Error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role || 'user';
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }
      
      // Add access token from OAuth provider
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.accessToken = token.accessToken as string;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      // Allows callback URLs on the same origin
      else if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },
  events: {
    async signIn({ user, account, profile, isNewUser }) {
      if (isNewUser) {
        logger.info('New user registered', { 
          userId: user.id, 
          email: user.email,
          provider: account?.provider 
        });
      }
    },
    async signOut({ session, token }) {
      logger.info('User signed out', { userId: token.id });
    },
    async createUser({ user }) {
      logger.info('User created', { userId: user.id, email: user.email });
    },
    async linkAccount({ user, account, profile }) {
      logger.info('Account linked', { userId: user.id, provider: account.provider });
    },
    async session({ session, token }) {
      // Update last active timestamp
      if (token.id) {
        try {
          await db.update(users)
            .set({ lastActiveAt: new Date() })
            .where(eq(users.id, token.id as string));
        } catch (error) {
          logger.error('Failed to update lastActive', error as Error);
        }
      }
    },
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
    async encode({ token, secret, maxAge }) {
      // Use default JWT encoding
      return await import('jose').then(({ SignJWT }) => {
        return new SignJWT(token as any)
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuedAt()
          .setExpirationTime(Math.floor(Date.now() / 1000) + (maxAge || 30 * 24 * 60 * 60))
          .sign(new TextEncoder().encode(secret));
      });
    },
    async decode({ token, secret }) {
      try {
        const { jwtVerify } = await import('jose');
        const { payload } = await jwtVerify(
          token!,
          new TextEncoder().encode(secret)
        );
        return payload as any;
      } catch {
        return null;
      }
    },
  },
};

// Extend session type to include custom fields
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
      email: string;
      name?: string | null;
      image?: string | null;
    };
    accessToken?: string;
  }
  
  interface User {
    role?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: string;
    accessToken?: string;
  }
}

export default authOptions;