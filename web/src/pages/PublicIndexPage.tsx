import { useEffect } from 'react';
import { Box, AppBar, Toolbar, Typography, Container, Alert, Link } from '@mui/material';
import { useSiteStore } from '../stores/siteStore';
import { PUBLIC_BASE_PATH } from '../constants';

export default function PublicIndexPage() {
  const { siteName, showPoweredBy } = useSiteStore();

  useEffect(() => {
    document.title = siteName;
  }, [siteName]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {siteName}
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="info">
          Please access a specific notebook directly, e.g., {PUBLIC_BASE_PATH}/notebook-name
        </Alert>
      </Container>

      {showPoweredBy && (
        <Box sx={{ position: 'fixed', bottom: 16, left: 16 }}>
          <Typography variant="caption" color="text.secondary">
            Powered by{' '}
            <Link
              href="https://github.com/idealland-apps/ValeNote"
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
            >
              ValeNote
            </Link>
          </Typography>
        </Box>
      )}
    </Box>
  );
}
