import { useRouter } from 'next/router';
import { useEffect } from 'react';
import Header from '@/components/elements/Header';
import { Box } from '@mui/material';

export default function MatchIndex() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to first match or dashboard
    router.push('/');
  }, [router]);

  return (
    <>
      <Header />
      <Box>Redirecting...</Box>
    </>
  );
}

