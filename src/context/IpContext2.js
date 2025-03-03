import React, { createContext, useState } from 'react';
import {hostUrl} from '../utils/baseURL'

export const IpContext2 = createContext();

export const IpProvider2 = ({ children }) => {
  const [ip2, setIp2] = useState(hostUrl);

  return (
    <IpContext2.Provider value={{ ip2, setIp2 }}>
      {children}
    </IpContext2.Provider>
  );
};