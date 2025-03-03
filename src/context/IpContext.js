import React, { createContext, useState, useEffect } from 'react';
export const IpContext = createContext();

export const IpProvider = ({ children }) => {
  const [ip, setIp] = useState('http://localhost:5000'); // Default fallback IP

  useEffect(() => {
    const loadInitialIp = async () => {
      try {
        const response = await fetch('http://localhost:5000/config'); // Ensure this file is mounted in the container
        
        if (!response.ok) throw new Error('Failed to fetch IP config file');
        
        // const config = await response.json();
        // console.log(config)
        if (true) {
          setIp(`http://127.0.0.1:5000`); // Update Flask API dynamically
        } else {
          console.warn('IP address not found in config.json, using default');
        }
      } catch (error) {
        console.error('Error loading initial IP:', error);
      }
    };

    loadInitialIp();
  }, []);

  return (
    <IpContext.Provider value={{ ip, setIp }}>
      {children}
    </IpContext.Provider>
  );
};




// import React, { createContext, useState, useEffect } from 'react';

// export const IpContext = createContext();

// export const IpProvider = ({ children }) => {
//   const [ip, setIp] = useState('');

//   useEffect(() => {
//     // Load the initial IP address from a configuration file or API
//     const loadInitialIp = async () => {
//       try {
//         const response = await fetch('/config.json');
//         if (!response.ok) {
//           throw new Error('Network response was not ok');
//         }
//         const config = await response.json();
//         setIp(config.ssh_host || '192.168.1.144'); // Use default if not found
//       } catch (error) {
//         console.error('Error loading initial IP:', error);
//         setIp('192.168.1.144'); // Fallback to default IP
//       }
//     };

//     loadInitialIp();
//   }, []);

//   return (
//     <IpContext.Provider value={{ ip, setIp }}>
//       {children}
//     </IpContext.Provider>
//   );
// };



// import React, { createContext, useState } from 'react';

// export const IpContext = createContext();

// export const IpProvider = ({ children }) => {
//   const [ip, setIp] = useState('192.168.1.144');

//   return (
//     <IpContext.Provider value={{ ip, setIp }}>
//       {children}
//     </IpContext.Provider>
//   );
// };
