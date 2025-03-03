import './App.css';
import AppRouter from './router'; // Ensure the correct path to your router file
import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { IpProvider } from './context/IpContext'; // Ensure the correct path to your IpProvider file
import { IpProvider2 } from './context/IpContext2'; // Ensure the correct path to your IpProvider2 file
import { CommandListProvider } from './context/CommandListContext'; // Ensure the correct path to your CommandListProvider file

const theme = createTheme({
    palette: {
        mode: 'light', // or 'dark' based on your preference
    },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CommandListProvider>
        <IpProvider>
          <IpProvider2>
            <AppRouter />
          </IpProvider2>
        </IpProvider>
      </CommandListProvider>
    </ThemeProvider>
  );
}

export default App;



/* import './App.css';
import AppRouter from './router'; // Ensure the correct path to your router file
import React from 'react';
import IpProvider from './IpProvider'; // Ensure the correct path to your IpProvider file
import IpProvider2 from './IpProvider2'; // Ensure the correct path to your IpProvider2 file
function App() {
  return (
    <IpProvider>
      <IpProvider2>
        <AppRouter />
      </IpProvider2>
    </IpProvider>
  );
}

export default App;

*/