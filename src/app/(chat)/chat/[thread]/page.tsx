'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ErrorBoundary } from 'react-error-boundary';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { ThreadHeader } from '@/components/chat/ThreadHeader';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

function ThreadContent() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [thread, setThread] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const threadId = params?.thread as string;

  const fetchThread = useCallback(async () => {
    if (!threadId || !session?.user) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/builder/threads/${threadId}`, {
        headers: {
          'Authorization': `Bearer ${session.accessToken}`,
        },
      });
      
      if (response.status === 404) {
        setError('Thread not found');
        return;
      }
      
      if (response.status === 403) {
        setError('Access denied to this thread');
        return;
      }
      
      if (!response.ok) {
        throw new Error('Failed to fetch thread');
      }
      
      const data = await response.json();
      setThread(data);
      
    } catch (err) {
      console.error('Error fetching thread:', err);
      setError('Failed to load thread. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [threadId, session]);

  useEffect(() => {
    if (status === 'authenticated' && threadId) {
      fetchThread();
    }
  }, [status, threadId, fetchThread]);

  // Handle authentication status
  if (status === 'loading' || loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Please sign in to view this thread.
          <Button variant="link" className="ml-2" onClick={() => router.push('/sign-in')}>
            Sign In
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error}
          <Button variant="link" className="ml-2" onClick={() => router.push('/chat')}>
            Return to Chat
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!thread) {
    return (
      <Alert>
        <AlertDescription>
          Thread not found.
          <Button variant="link" className="ml-2" onClick={() => router.push('/chat')}>
            Create New Thread
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ThreadHeader thread={thread} onRefresh={fetchThread} />
      <ChatInterface 
        threadId={threadId} 
        initialMessages={thread.messages || []}
        onMessageSent={fetchThread}
      />
    </div>
  );
}

function ErrorFallback({ error, resetErrorBoundary }: { 
  error: Error; 
  resetErrorBoundary: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        <p>Something went wrong: {error.message}</p>
        <Button onClick={resetErrorBoundary} className="mt-2">
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export default function ThreadPage() {
  return (
    <ErrorBoundary 
      FallbackComponent={ErrorFallback}
      onReset={() => window.location.reload()}
    >
      <ThreadContent />
    </ErrorBoundary>
  );
}