import React, { createContext, useState, useEffect } from 'react';

// Create a context for the command list
export const CommandListContext = createContext();

// Provider component to wrap around components that need access to the command list
export const CommandListProvider = ({ children }) => {
  // State to hold the list of commands
  const [commandList, setCommandList] = useState([]);

  // useEffect hook to retrieve data from local storage when the component mounts
  useEffect(() => {
    // Retrieve the command list from local storage, or use an empty array if not found
    const storedCommands = JSON.parse(localStorage.getItem('commandList')) || [];
    // Update the state with the retrieved command list
    setCommandList(storedCommands);
  }, []);

  // Function to add a new command to the list
  const addCommand = (command) => {
    // Create a new command object with a timestamp and the command text
    const newCommand = {
      timestamp: new Date().toLocaleString(),
      command,
    };
    // Update the command list state with the new command
    const updatedCommandList = [...commandList, newCommand];
    setCommandList(updatedCommandList);

    // Save the updated command list to local storage
    localStorage.setItem('commandList', JSON.stringify(updatedCommandList));
  };

  // Provide the command list and addCommand function to children components
  return (
    <CommandListContext.Provider value={{ commandList, addCommand }}>
      {children}
    </CommandListContext.Provider>
  );
};