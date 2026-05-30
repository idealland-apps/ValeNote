import { useState, useEffect } from 'react';
import { Box, IconButton, List, ListItemButton, ListItemText, Paper, Tooltip, Collapse, useMediaQuery, useTheme, Drawer } from '@mui/material';
import { ChevronRight, ChevronLeft, Toc as TocIcon } from '@mui/icons-material';

interface TocItem {
  index: number;
  text: string;
  level: number;
  element: Element;
}

interface Props {
  containerRef: React.RefObject<HTMLElement | null>;
  isPublic?: boolean;
}

const TOC_WIDTH = 220;

export default function TableOfContents({ containerRef, isPublic = false }: Props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [desktopExpanded, setDesktopExpanded] = useState(true);

  useEffect(() => {
    if (!isMobile) {
      setDrawerOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scanHeadings = () => {
      const elements = container.querySelectorAll('[data-heading-index]');
      const items: TocItem[] = [];

      elements.forEach((el) => {
        const index = parseInt(el.getAttribute('data-heading-index') || '0', 10);
        const tagName = el.tagName.toLowerCase();
        const level = parseInt(tagName.replace('h', ''), 10);
        items.push({
          index,
          text: el.textContent || '',
          level,
          element: el,
        });
      });

      setHeadings(items);
    };

    scanHeadings();

    const observer = new MutationObserver(scanHeadings);
    observer.observe(container, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [containerRef]);

  const minLevel = headings.length > 0 ? Math.min(...headings.map(h => h.level)) : 1;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || headings.length === 0) return;

    const handleScroll = () => {
      const containerRect = container.getBoundingClientRect();
      let currentIndex: number | null = null;

      for (let i = headings.length - 1; i >= 0; i--) {
        const rect = headings[i].element.getBoundingClientRect();
        if (rect.top <= containerRect.top + 10) {
          currentIndex = headings[i].index;
          break;
        }
      }

      if (currentIndex === null && headings.length > 0) {
        currentIndex = headings[0].index;
      }

      setActiveIndex(currentIndex);
    };

    container.addEventListener('scroll', handleScroll);
    handleScroll();

    return () => container.removeEventListener('scroll', handleScroll);
  }, [headings, containerRef]);

  const handleClick = (heading: TocItem) => {
    heading.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (isMobile) {
      setDrawerOpen(false);
    }
  };

  if (headings.length === 0) {
    return null;
  }

  const tocList = (
    <List dense sx={{ py: 0.25, pt: 1 }}>
      {headings.map((heading) => {
        const isActive = activeIndex === heading.index;
        return (
          <ListItemButton
            key={heading.index}
            onClick={() => handleClick(heading)}
            sx={{
              pl: 1.5 + (heading.level - minLevel) * 1.5,
              py: 0.25,
              minHeight: 26,
              position: 'relative',
              '&::before': isActive ? {
                content: '""',
                position: 'absolute',
                left: 0,
                top: 4,
                bottom: 4,
                width: 3,
                bgcolor: 'primary.main',
              } : {},
              '&:hover': {
                bgcolor: 'action.hover',
              },
            }}
          >
            <ListItemText
              primary={heading.text}
              slotProps={{
                primary: {
                  variant: 'body2',
                  noWrap: true,
                  sx: {
                    fontSize: heading.level <= 2 ? '0.8rem' : '0.75rem',
                    fontWeight: heading.level <= 2 ? 500 : 400,
                    color: isActive ? 'primary.main' : 'text.primary',
                  },
                },
              }}
            />
          </ListItemButton>
        );
      })}
    </List>
  );

  if (isMobile) {
    return (
      <>
        <IconButton
          size="small"
          onClick={() => setDrawerOpen(true)}
          sx={{
            position: 'fixed',
            right: 16,
            top: isPublic ? 80 : 140,
            zIndex: theme.zIndex.drawer - 1,
            bgcolor: 'background.paper',
            boxShadow: 1,
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <TocIcon fontSize="small" />
        </IconButton>
        <Drawer
          anchor="right"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          sx={{
            '& .MuiDrawer-paper': {
              width: TOC_WIDTH,
              pt: 8,
            },
          }}
        >
          {tocList}
        </Drawer>
      </>
    );
  }

  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        height: 'fit-content',
        maxHeight: 'calc(100vh - 120px)',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-start',
      }}
    >
      <Collapse in={desktopExpanded} orientation="horizontal" collapsedSize={0}>
        <Paper
          elevation={0}
          sx={{
            width: TOC_WIDTH,
            maxHeight: 'calc(100vh - 120px)',
            overflow: 'auto',
            borderLeft: 1,
            borderColor: 'divider',
            borderRadius: 0,
            bgcolor: 'transparent',
          }}
        >
          {tocList}
        </Paper>
      </Collapse>

      <Tooltip title={desktopExpanded ? 'Collapse TOC' : 'Expand TOC'} placement="left">
        <IconButton
          size="small"
          onClick={() => setDesktopExpanded(!desktopExpanded)}
          sx={{
            width: 24,
            height: 24,
            minWidth: 24,
            p: 0,
            color: 'text.secondary',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          {desktopExpanded ? <ChevronRight fontSize="small" /> : <ChevronLeft fontSize="small" />}
        </IconButton>
      </Tooltip>
    </Box>
  );
}
