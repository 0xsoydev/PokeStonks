import { notFound } from 'next/navigation';

/** QA harnesses (art gallery, audio bench, battle sandbox). Hidden in production unless explicitly enabled. */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_DEV_PAGES !== '1') notFound();
  return children;
}
