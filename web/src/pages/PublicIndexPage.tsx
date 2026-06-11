import { useEffect } from 'react';
import { Box, Typography, Container, Alert, Link } from '@mui/material';
import { useSiteStore } from '../stores/siteStore';
import { PUBLIC_BASE_PATH } from '../constants';

export default function PublicIndexPage() {
  const { siteName, showPoweredBy } = useSiteStore();

  useEffect(() => {
    document.title = siteName;
  }, [siteName]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'background.paper' }}>
        <Box component="img" src="/favicon.svg" sx={{ width: 24, height: 24, minWidth: 24, minHeight: 24, maxWidth: 24, maxHeight: 24, flexShrink: 0, borderRadius: '4px' }} />
        <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
          {siteName}
        </Typography>
      </Box>

      {/* Content */}
      <Container maxWidth="lg" sx={{ py: 4, flexGrow: 1 }}>
        <Alert severity="info">
          Please access a specific notebook directly, e.g., {PUBLIC_BASE_PATH}/notebook-name
        </Alert>
      </Container>

      {/* Footer */}
      {showPoweredBy && (
        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
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
