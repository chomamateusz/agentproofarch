import { createTheme, type Theme } from '@mui/material/styles';

/**
 * The entire "engineer's logbook" visual language lives in this theme:
 * colors, fonts and component overrides. Pages only use MUI components
 * with their stock props/variants, plus `sx` for layout and spacing.
 * The accent hue is derived from the tenant slug, so each tenant gets
 * its own theme instance via a nested ThemeProvider.
 */

const FONT_MONO = "ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace";
const FONT_DISPLAY =
  "'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif";

const PAPER = '#f6f2ea';
const PAPER_RAISED = '#fdfbf6';
const INK = '#191512';
const INK_SOFT = '#5c5348';
const LINE = 'rgba(25, 21, 18, 0.14)';
const LINE_STRONG = 'rgba(25, 21, 18, 0.55)';

export const createAppTheme = (accentHue = 24): Theme => {
  const accent = `hsl(${accentHue} 62% 42%)`;
  const accentInk = `hsl(${accentHue} 70% 28%)`;
  const accentWash = `hsl(${accentHue} 55% 50% / 0.09)`;

  return createTheme({
    palette: {
      mode: 'light',
      primary: { main: accent, dark: accentInk, contrastText: PAPER },
      background: { default: PAPER, paper: PAPER_RAISED },
      text: { primary: INK, secondary: INK_SOFT },
      divider: LINE,
      error: { main: '#a03123' },
    },
    shape: { borderRadius: 0 },
    typography: {
      fontFamily: FONT_MONO,
      body1: { fontSize: '0.95rem', lineHeight: 1.55 },
      body2: { fontSize: '0.8rem' },
      h1: {
        fontFamily: FONT_DISPLAY,
        fontSize: '1.7rem',
        fontWeight: 600,
        letterSpacing: '-0.01em',
      },
      h2: { fontFamily: FONT_DISPLAY, fontSize: '1.05rem', fontStyle: 'italic', color: INK_SOFT },
      overline: {
        fontSize: '0.72rem',
        letterSpacing: '0.1em',
        lineHeight: 2,
        color: INK_SOFT,
      },
      button: { fontSize: '0.78rem', letterSpacing: '0.14em' },
      caption: { fontSize: '0.72rem', color: INK_SOFT },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            background: `linear-gradient(${LINE} 1px, transparent 1px) 0 -1px / 100% 2.25rem, ${PAPER}`,
          },
          '@keyframes settle': {
            from: { opacity: 0, transform: 'translateY(0.5rem)' },
            to: { opacity: 1, transform: 'none' },
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true, disableRipple: true },
        styleOverrides: {
          contained: {
            backgroundColor: INK,
            color: PAPER,
            padding: '0.75rem 1.3rem',
            '&:hover': { backgroundColor: accentInk },
            '&.Mui-disabled': { backgroundColor: INK, color: PAPER, opacity: 0.4 },
          },
          text: {
            color: INK_SOFT,
            padding: 0,
            minWidth: 0,
            borderBottom: `1px dashed ${LINE_STRONG}`,
            borderRadius: 0,
            '&:hover': { background: 'none', color: '#a03123', borderBottomColor: '#a03123' },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 0 },
          outlined: {
            borderColor: accentInk,
            color: accentInk,
            backgroundColor: accentWash,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            fontSize: '0.72rem',
            height: 'auto',
            padding: '0.05rem 0',
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          outlined: {
            border: `1.5px solid ${LINE_STRONG}`,
            boxShadow: `0.5rem 0.5rem 0 ${accentWash}, 0.5rem 0.5rem 0 1.5px ${LINE}`,
          },
        },
      },
      MuiTextField: {
        defaultProps: { variant: 'outlined', size: 'small', fullWidth: true },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: PAPER,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: LINE_STRONG, borderWidth: 1 },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: accent,
              borderWidth: 2,
            },
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            fontSize: '0.78rem',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: INK_SOFT,
          },
        },
      },
      MuiInputBase: {
        styleOverrides: {
          input: { '&::placeholder': { color: INK_SOFT, fontStyle: 'italic', opacity: 1 } },
        },
      },
      MuiLink: {
        defaultProps: { underline: 'none' },
        styleOverrides: {
          root: {
            color: INK,
            borderBottom: `1px dashed ${LINE_STRONG}`,
            paddingBottom: 1,
            '&:hover': { color: accentInk, borderBottomColor: accentInk },
          },
        },
      },
      MuiListItem: {
        styleOverrides: {
          root: {
            borderBottom: `1px solid ${LINE}`,
            paddingTop: '0.7rem',
            paddingBottom: '0.7rem',
            '&:hover': { backgroundColor: accentWash },
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: { '&:hover': { backgroundColor: accentWash } },
        },
      },
      MuiAlert: {
        defaultProps: { severity: 'error', icon: false, variant: 'standard' },
        styleOverrides: {
          root: {
            background: 'none',
            color: '#a03123',
            padding: 0,
            fontSize: '0.8rem',
          },
        },
      },
      MuiDivider: {
        styleOverrides: { root: { borderColor: LINE } },
      },
    },
  });
};
