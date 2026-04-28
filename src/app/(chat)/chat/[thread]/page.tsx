// BUG: Missing error boundary
// If thread doesn't exist, component crashes without graceful handling

export default function ThreadPage({ params }: { params: { thread: string } }) {
  // BUG: params.thread might be undefined in some Next.js versions
  // Should validate params exist before using
}