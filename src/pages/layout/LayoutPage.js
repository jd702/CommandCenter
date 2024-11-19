/*
import React from "react";
import { styled, useTheme } from "@mui/material/styles";
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
} from "@mui/material";

import HistoryIcon from "@mui/icons-material/History";
import MenuIcon from "@mui/icons-material/Menu";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import PodcastsIcon from "@mui/icons-material/Podcasts";
import { Link, Outlet, useLocation } from "react-router-dom";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import BarChartIcon from '@mui/icons-material/BarChart';

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
    name: "History Data",
    path: "/historydata",
    icon: <HistoryIcon />,
  },
  {
    index: 2,
    name: "Live Data",
    path: "/livedata",
    icon: <PodcastsIcon />,
  },
  {
    index: 3,
    name: "Bowie State University - Streaming Inference Monitoring System",
    path: "/results",
    icon: <BarChartIcon />,
  },
];

const openedMixin = (theme) => ({
  width: drawerWidth,
  transition: theme.transitions.create("width", {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
  overflowX: "hidden",
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

export default function LayoutPage() {
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
      setPageNavName("History Data");
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
            className="LinkLineRemove"
          >
            {pageNavName}
          </Typography>
        </Toolbar>
      </AppBar>
      <Drawer variant="permanent" open={open}>
        <DrawerHeader>
          <Box
            component="img"
            src={require("../../logo.svg")}
            alt="logo"
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
            className="LinkLineRemove"
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
                style={{ textDecoration: "none", color: "black" }}
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
        <Outlet />
      </Box>
    </Box>
  );
}

*/