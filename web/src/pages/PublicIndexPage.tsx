import { Box, AppBar, Toolbar, Typography, Container, Alert } from '@mui/material';
import { useSiteStore } from '../stores/siteStore';
import { PUBLIC_BASE_PATH } from '../constants';

export default function PublicIndexPage() {
  const { siteName } = useSiteStore();

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
    </Box>
  );
}
