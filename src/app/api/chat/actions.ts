import { db } from '@/lib/db';
import { messages, threads } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { cache } from 'react';

// Database connection pooling is handled by Drizzle/PostgreSQL driver
// This file focuses on safe, transactional operations

export const getThreadMessages = cache(async (threadId: string, userId: string) => {
  try {
    // Verify thread ownership in the same query
    const result = await db.query.threads.findFirst({
      where: and(
        eq(threads.id, threadId),
        eq(threads.userId, userId)
      ),
      with: {
        messages: {
          orderBy: [desc(messages.createdAt)],
          limit: 50,
        },
      },
    });

    if (!result) {
      throw new Error('Thread not found or access denied');
    }

    return result.messages;
  } catch (error) {
    console.error('Error fetching thread messages:', error);
    throw error;
  }
});

export const saveMessage = async (
  threadId: string, 
  userId: string, 
  content: string, 
  role: 'user' | 'assistant',
  model?: string,
  metadata?: Record<string, unknown>
) => {
  try {
    // Use transaction to ensure data consistency
    return await db.transaction(async (tx) => {
      // Verify thread ownership before inserting
      const thread = await tx.query.threads.findFirst({
        where: and(
          eq(threads.id, threadId),
          eq(threads.userId, userId)
        ),
      });

      if (!thread) {
        throw new Error('Thread not found or access denied');
      }

      // Insert message
      const [newMessage] = await tx.insert(messages).values({
        threadId,
        content,
        role,
        model: model || null,
        metadata: metadata || {},
        createdAt: new Date(),
      }).returning();

      // Update thread's last activity timestamp
      await tx.update(threads)
        .set({ updatedAt: new Date() })
        .where(eq(threads.id, threadId));

      return newMessage;
    });
  } catch (error) {
    console.error('Error saving message:', error);
    throw error;
  }
};

export const createThread = async (
  userId: string, 
  title: string, 
  initialMessage?: { content: string; role: 'user' | 'assistant' }
) => {
  try {
    return await db.transaction(async (tx) => {
      // Create thread
      const [newThread] = await tx.insert(threads).values({
        userId,
        title: title.substring(0, 200), // Limit title length
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();

      // Optionally add initial message
      if (initialMessage) {
        await tx.insert(messages).values({
          threadId: newThread.id,
          content: initialMessage.content.substring(0, 10000), // Limit content
          role: initialMessage.role,
          createdAt: new Date(),
        });
      }

      return newThread;
    });
  } catch (error) {
    console.error('Error creating thread:', error);
    throw error;
  }
};

export const deleteThread = async (threadId: string, userId: string) => {
  try {
    // Verify ownership and delete in transaction
    return await db.transaction(async (tx) => {
      const thread = await tx.query.threads.findFirst({
        where: and(
          eq(threads.id, threadId),
          eq(threads.userId, userId)
        ),
      });

      if (!thread) {
        throw new Error('Thread not found or access denied');
      }

      // Delete messages first (foreign key constraint)
      await tx.delete(messages).where(eq(messages.threadId, threadId));
      
      // Then delete thread
      await tx.delete(threads).where(eq(threads.id, threadId));

      return { success: true };
    });
  } catch (error) {
    console.error('Error deleting thread:', error);
    throw error;
  }
};