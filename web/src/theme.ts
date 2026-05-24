import { createTheme } from '@mui/material/styles';
import type { ThemeOptions } from '@mui/material/styles';

const baseTheme: ThemeOptions = {
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          overscrollBehavior: 'none',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
        },
      },
      defaultProps: {
        disableElevation: true,
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
        },
      },
    },
    MuiTooltip: {
      defaultProps: {
        enterDelay: 500,
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: '8px',
        },
        list: {
          padding: '4px 0',
        },
      },
      defaultProps: {
        slotProps: {
          paper: {
            elevation: 3,
          },
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: '8px',
          margin: '0px 4px',
          paddingLeft: '8px',
          paddingRight: '8px',
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          paddingTop: 0,
        },
      },
    },
    MuiFilledInput: {
      styleOverrides: {
        root: {
          '&::before, &::after': {
            borderBottom: 'none',
          },
          '&:hover:not(.Mui-disabled, .Mui-error):before': {
            borderBottom: 'none',
          },
          borderRadius: 12,
        },
      },
    },
    MuiSkeleton: {
      defaultProps: {
        animation: 'wave',
      },
    },
  },
};

export const lightTheme = createTheme({
  ...baseTheme,
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#9c27b0',
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
  },
});

export const darkTheme = createTheme({
  ...baseTheme,
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
    },
    secondary: {
      main: '#ce93d8',
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
  },
});

export const getTheme = (mode: 'light' | 'dark') => {
  return mode === 'dark' ? darkTheme : lightTheme;
};
