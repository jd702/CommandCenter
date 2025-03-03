import React, { useContext } from 'react';
import { CommandListContext } from '../context/CommandListContext';
import { IpContext } from '../context/IpContext';
import { IpContext2 } from '../context/IpContext2';
import { Grid, Card, CardContent, Typography } from '@mui/material';

const History = () => {
  const { commandList } = useContext(CommandListContext);
  const { ip } = useContext(IpContext);
  const { ip2 } = useContext(IpContext2);

  return (
    <Grid container spacing={0} direction="column" alignItems="center" justify="center" style={{ minHeight: '100vh' }}>
      <Card sx={{ minWidth: 800, mb: 4 }} style={{ backgroundColor: '#d4edda' }}>
        <CardContent>
          <Typography gutterBottom component="div" align="center" sx={{ color: 'black', fontSize: 60, mt: 4, textTransform: 'uppercase', height: 80 }}>
            Command History
          </Typography>
          <Typography variant="h6" color="text.primary" sx={{ color: 'black', mt: 1 }}>
            Current Flask IP: {ip}
          </Typography>
          <Typography variant="h6" color="text.primary" sx={{ color: 'black', mt: 1 }}>
            Current Tasking IP: {ip2}
          </Typography>
          <ul>
            {commandList.map((cmd, index) => (
              <li key={index}>
                {cmd.timestamp}: {cmd.command}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </Grid>
  );
};

export default History;