import { createTheme } from '@mui/material/styles';
import type { ThemeOptions } from '@mui/material/styles';

const baseTheme: ThemeOptions = {
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: 13,
    body1: {
      fontSize: '0.875rem',
    },
    body2: {
      fontSize: '0.8rem',
    },
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
          fontSize: '0.8rem',
        },
        sizeSmall: {
          padding: '4px 10px',
          fontSize: '0.75rem',
        },
        sizeMedium: {
          padding: '6px 14px',
        },
      },
      defaultProps: {
        disableElevation: true,
        size: 'small',
      },
    },
    MuiIconButton: {
      defaultProps: {
        size: 'small',
      },
      styleOverrides: {
        sizeSmall: {
          padding: 6,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        size: 'small',
      },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            fontSize: '0.85rem',
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          fontSize: '0.85rem',
        },
        input: {
          '&.MuiInputBase-inputSizeSmall': {
            padding: '6px 12px',
          },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        sizeSmall: {
          fontSize: '0.85rem',
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
        },
        sizeSmall: {
          padding: '4px 10px',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          minHeight: 36,
          minWidth: 48,
          padding: '6px 12px',
          fontSize: '0.8rem',
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 36,
        },
      },
    },
    MuiChip: {
      defaultProps: {
        size: 'small',
      },
      styleOverrides: {
        sizeSmall: {
          height: 22,
          fontSize: '0.75rem',
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
          borderRadius: 8,
          padding: '6px 12px',
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: '6px',
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
          borderRadius: '6px',
          margin: '0px 4px',
          paddingLeft: '8px',
          paddingRight: '8px',
          minHeight: 28,
          fontSize: '0.8rem',
        },
      },
    },
    MuiListItemIcon: {
      styleOverrides: {
        root: {
          minWidth: 28,
        },
      },
    },
    MuiListItemText: {
      styleOverrides: {
        primary: {
          fontSize: '0.8rem',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontSize: '1rem',
          padding: '12px 16px',
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          paddingTop: 0,
          padding: '8px 16px',
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: '8px 16px',
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
          borderRadius: 8,
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

export const getTheme = (mode: 'light' | 'dark', primaryColor?: string) => {
  const color = primaryColor || '#1976d2';
  return createTheme({
    ...baseTheme,
    palette: {
      mode,
      primary: {
        main: mode === 'dark' ? lightenColor(color, 0.3) : color,
      },
      secondary: {
        main: mode === 'dark' ? '#ce93d8' : '#9c27b0',
      },
      background: mode === 'dark'
        ? { default: '#121212', paper: '#1e1e1e' }
        : { default: '#f5f5f5', paper: '#ffffff' },
    },
  });
};

function lightenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * amount));
  const g = Math.min(255, Math.floor(((num >> 8) & 0x00FF) + (255 - ((num >> 8) & 0x00FF)) * amount));
  const b = Math.min(255, Math.floor((num & 0x0000FF) + (255 - (num & 0x0000FF)) * amount));
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
}
