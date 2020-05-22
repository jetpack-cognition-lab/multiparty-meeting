import { createMuiTheme } from '@material-ui/core/styles'

const blue = '#0064ac'

const jetpack = createMuiTheme({
  overrides: {
    MuiFab: {
      root: {
        width: '40px',
        height: '40px',
      },
      primary: {
        backgroundColor: '#00a0e0',
      },
      secondary: {
        backgroundColor: '#00a0e0',
      }
    },
    MuiBadge: {
      colorPrimary: {
        backgroundColor: '#00a0e0'
      }
    },
    MuiButton: {
      root: {
        color: '#fff',
        border: '2px solid #000',
      },
      contained: {
        color: '#fff',
        backgroundColor: blue,
      },
      containedSecondary: {
        color: '#fff',
        backgroundColor: blue,
      }
    },
    MuiAppBar: {
      colorPrimary: {
        color: '#fff',
        backgroundColor: blue
      }
    }
  },
  pallete: {
    primary: {
      main: '#ac0000',
    },
    secondary: {
      main: '#206600',
    },
    contrastThreshold: 3,
    tonalOffset: 0.2,
  },
  typography: {
     fontFamily: [
       'Roboto', '"Helvetica Neue"', 'opensans', 'sans-serif'
     ].join(', ')
  },
  shape: {
    borderRadius: 0
  },
})

export default jetpack
