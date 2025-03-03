import React from "react";
import { styled, useTheme } from "@mui/material/styles";
import Ros2Agents from './Ros2Agents'; // Import the ROS2Agents component
import MuiAppBar from "@mui/material/AppBar";
import MuiDrawer from "@mui/material/Drawer";
import {
  Box,
  Toolbar,
  List,
  CssBaseline,
  Typography,
  Divider,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  IconButton,
  Button,
  Grid,
  Paper,
} from "@mui/material";
import DashboardIcon from '@mui/icons-material/Dashboard';
import NotificationsIcon from '@mui/icons-material/Notifications';
import HistoryIcon from "@mui/icons-material/History";
import MenuIcon from "@mui/icons-material/Menu";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import PodcastsIcon from "@mui/icons-material/Podcasts";
import { Link, Outlet, useLocation } from "react-router-dom";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import BarChartIcon from '@mui/icons-material/BarChart';
import AssignmentIcon from '@mui/icons-material/Assignment';
import './MainHub.css'; // Import the specific CSS for MainHub component
import SettingsIcon from '@mui/icons-material/Settings';
import InfoIcon from '@mui/icons-material/Info';
import SettingsApplicationsIcon from '@mui/icons-material/SettingsApplications';
import HelpIcon from '@mui/icons-material/Help';
import History from './History'; // Import the History component
import Tasking from './Tasking'; // Import other components as needed
import SettingsPage from './SettingsPage'; // Import other components as needed
import AgentTracker from './AgentTracker'; //  Import the Agent Tracker component
import RobotIcon from '@mui/icons-material/SmartToy'; // Import the robot icon

const drawerWidth = 240;

const sideBar = [
  {
    index: 0,
    name: "Home",
    path: "/",
    icon: <HomeOutlinedIcon />,
  },
  {
    index: 1,
    name: "Sensor Audio Collection",
    path: "/sensor-audio",
    icon: <PodcastsIcon />,
  },
  {
    index: 2,
    name: "Camera Visual Data Collection",
    path: "/camera-visual",
    icon: <BarChartIcon />,
  },
  {
    index: 3,
    name: "Tasking",
    path: "/tasking",
    icon: <AssignmentIcon />,
  },
  {
    index: 4,
    name: "Settings",
    path: "/settings",
    icon: <SettingsIcon />,
  },
  {
    index: 5,
    name: "History Data",
    path: "/history",
    icon: <HistoryIcon />,
  },
  { 
    index: 6, 
    name: "Agent Tracker", 
    path: "/tracker", 
    icon: <DashboardIcon /> 
  },
  { 
    index: 7, 
    name: "ROS2 Agents", 
    path: "/ros2agents", 
    icon: <RobotIcon /> 
  },
];

const openedMixin = (theme) => ({
  transition: theme.transitions.create("width", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
  width: drawerWidth,
});

const closedMixin = (theme) => ({
  transition: theme.transitions.create("width", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  overflowX: "hidden",
  width: `calc(${theme.spacing(7)} + 1px)`,
  [theme.breakpoints.up("sm")]: {
    width: `calc(${theme.spacing(8)} + 1px)`,
  },
});

const DrawerHeader = styled("div")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  padding: theme.spacing(0, 1),
  // necessary for content to be below app bar
  ...theme.mixins.toolbar,
}));

const AppBar = styled(MuiAppBar, {
  shouldForwardProp: (prop) => prop !== "open",
})(({ theme, open }) => ({
  zIndex: theme.zIndex.drawer + 1,
  transition: theme.transitions.create(["width", "margin"], {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  ...(open && {
    marginLeft: drawerWidth,
    width: `calc(100% - ${drawerWidth}px)`,
    transition: theme.transitions.create(["width", "margin"], {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.enteringScreen,
    }),
  }),
}));

const Drawer = styled(MuiDrawer, {
  shouldForwardProp: (prop) => prop !== "open",
})(({ theme, open }) => ({
  width: drawerWidth,
  flexShrink: 0,
  whiteSpace: "nowrap",
  boxSizing: "border-box",
  ...(open && {
    ...openedMixin(theme),
    "& .MuiDrawer-paper": openedMixin(theme),
  }),
  ...(!open && {
    ...closedMixin(theme),
    "& .MuiDrawer-paper": closedMixin(theme),
  }),
}));

const MainHub = () => {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const location = useLocation();
  const theme = useTheme();
  const [open, setOpen] = React.useState(false);
  const [pageNavName, setPageNavName] = React.useState("");

  const handleListItemClick = (event, index) => {
    setSelectedIndex(index);
  };

  React.useEffect(() => {
    window.scrollTo(0, 0);
    if (location.pathname === "/") {
      setSelectedIndex(0);
      setPageNavName("Home");
    }

    const currentPage = sideBar.find((r) => {
      return r.path === location.pathname;
    });

    if (currentPage) {
      setSelectedIndex(currentPage.index);
      setPageNavName(currentPage.name);
    }
  }, [location]);

  const handleDrawerOpen = () => {
    setOpen(true);
  };

  const handleDrawerClose = () => {
    setOpen(false);
  };

  return (
    <Box sx={{ display: "flex" }}>
      <CssBaseline />
      <AppBar position="fixed" open={open}>
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            onClick={handleDrawerOpen}
            edge="start"
            sx={{
              marginRight: 5,
              ...(open && { display: "none" }),
            }}
          >
            <MenuIcon />
          </IconButton>
          <Typography
            variant="h6"
            noWrap
            component="div"
            className="link-line-remove"
          >
            {pageNavName}
          </Typography>
        </Toolbar>
      </AppBar>
      <Drawer variant="permanent" open={open}>
        <DrawerHeader>
          <Box
            component="img"
            src={require("../logo.svg")} // Updated import path
            sx={{
              height: "55px",
              width: "auto",
              marginRight: "10px",
            }}
          />
          <Typography
            variant="subtitle2"
            noWrap
            component="div"
            className="link-line-remove"
            style={{ marginTop: "8px" }}
          >
            Acoustic Data
            <br />
            Acquisition System
          </Typography>

          <IconButton onClick={handleDrawerClose}>
            {theme.direction === "rtl" ? (
              <ChevronRightIcon />
            ) : (
              <ChevronLeftIcon />
            )}
          </IconButton>
        </DrawerHeader>
        <Divider />
        <List>
          {sideBar.map((item, index) => (
            <ListItem key={item.index} disablePadding sx={{ display: "block" }}>
              <Link
                to={item.path}
                className="link-line-remove"
              >
                <Tooltip title={item.name} placement="right">
                  <ListItemButton
                    sx={{
                      minHeight: 48,
                      justifyContent: open ? "initial" : "center",
                      px: 2.5,
                    }}
                    selected={selectedIndex === item.index}
                    onClick={(event) => handleListItemClick(event, item.index)}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 0,
                        mr: open ? 3 : "auto",
                        justifyContent: "center",
                      }}
                    >
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={item.name}
                      sx={{ opacity: open ? 1 : 0 }}
                    />
                  </ListItemButton>
                </Tooltip>
              </Link>
            </ListItem>
          ))}
        </List>
        <List style={{ marginTop: `auto` }}>
          <ListItem>
            <ListItemText style={{ textAlign: "center" }}>
              {process.env.REACT_APP_APP_VERSION}
            </ListItemText>
          </ListItem>
        </List>
      </Drawer>
      <Box
        component="main"
        sx={{ flexGrow: 1, p: 3, backgroundColor: "#f2f4f5" }}
      >
        <DrawerHeader />
        {location.pathname === "/" ? (
          <Box>
            <Typography variant="h4" gutterBottom className="welcome-message">
              Welcome to the Mission Control Center
            </Typography>
            <Typography variant="body1" gutterBottom className="welcome-message">
              This is the central hub for managing and monitoring the autonomous systems associated with Bowie State University. Use the navigation menu to access different sections.
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Paper elevation={3} className="quick-links">
                  <Typography variant="h6" gutterBottom>
                    Quick Links
                  </Typography>
                  <Button variant="contained" color="primary" component={Link} to="/sensor-audio" className="button">
                    Go to Sensor Audio Collection
                  </Button>
                  <Button variant="contained" color="secondary" component={Link} to="/camera-visual" className="button">
                    Go to Camera Visual Data Collection
                  </Button>
                </Paper>
              </Grid>
              <Grid item xs={12} md={6}>
                <Paper elevation={3} className="system-status">
                  <Typography variant="h6" gutterBottom>
                    System Status
                  </Typography>
                  <Typography variant="body2">
                    All systems are operational. No issues detected.
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
          </Box>
        ) : (
          <Outlet />
        )}
      </Box>
    </Box>
  );
};

export default MainHub;