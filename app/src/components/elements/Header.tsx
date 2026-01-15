import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material';
import React, { useState, useEffect } from 'react';
import { styled } from '@mui/material/styles';
import Sidebar from './Sidebar';
import Banner from './Banner';
import Menu from '@mui/material/Menu';
import Link from 'next/link';
import { useRouter } from 'next/router';
// import { useAccount } from 'wagmi';

const StyledMenuButton = styled(Button)({
  fontFamily: 'Open Sans, sans-serif',
  fontWeight: 700,
  fontSize: '18px',
  marginLeft: '38px',
});

const headersData = [
  {
    label: 'Dashboard',
    href: '/',
  },
  {
    label: 'Active Bets',
    href: '/active-bets',
  },
  {
    label: 'Bets History',
    href: '/history-bets',
  },
  {
    label: 'FAQ',
    href: '/faq',
  },
];
const headersDataTwo: Array<{ label: string; href: string }> = [];

export default function Header() {
  const router = useRouter();
  // const { isConnected } = useAccount();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  const [anchorEltwo, setAnchorEltwo] = React.useState<null | HTMLElement>(null);
  const opentwo = Boolean(anchorEltwo);
  const handleClicktwo = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEltwo(event.currentTarget);
  };
  const handleClosetwo = () => {
    setAnchorEltwo(null);
  };

  const [anchorElthree, setAnchorElthree] = React.useState<null | HTMLElement>(null);
  const openthree = Boolean(anchorElthree);
  const handleClickthree = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorElthree(event.currentTarget);
  };
  const handleClosethree = () => {
    setAnchorElthree(null);
  };

  const [state, setState] = useState({
    mobileView: false,
  });

  const { mobileView } = state;

  useEffect(() => {
    const setResponsiveness = () => {
      return window.innerWidth < 1199
        ? setState((prevState) => ({ ...prevState, mobileView: true }))
        : setState((prevState) => ({ ...prevState, mobileView: false }));
    };

    setResponsiveness();

    window.addEventListener('resize', () => setResponsiveness());

    return () => {
      window.removeEventListener('resize', () => setResponsiveness());
    };
  }, []);

  const displayDesktop = () => {
    return (
      <Toolbar className="toolbar">
        <Link href="/" style={{ textDecoration: 'none' }}>
          {femmecubatorLogo}
        </Link>
        <div className="insdmn">
          {getMenuButtons()}
        </div>
      </Toolbar>
    );
  };

  const displayMobile = () => {
    return (
      <Toolbar>
        <Link href="/" style={{ textDecoration: 'none' }}>
          {femmecubatorLogo}
        </Link>
      </Toolbar>
    );
  };

  const femmecubatorLogo = <Box component="img" className="logoheader" src="/img/0blade.png" />;

  const getMenuButtons = () => {
    return headersData.map(({ label, href }) => {
      return (
        <StyledMenuButton
          key={label}
          color="inherit"
          href={href}
        >
          {label}
        </StyledMenuButton>
      );
    });
  };
  
  const pathname = router.pathname;
  const splitLocation = pathname.split('/');

  return (
    <>
      <Box className="botum_manu_box">
        <div className="bet_btn_p">
          <Box
            className={
              splitLocation[1] === '' || splitLocation[1] === 'active-bets' || splitLocation[1] === 'history-bets'
                ? 'manu_img_paert_aj active'
                : 'manu_img_paert_aj'
            }
          >
            <img src="/img/bet_img_aj.svg" alt="" />
            <Button
              id="basic-button"
              aria-controls={open ? 'basic-menu' : undefined}
              aria-haspopup="true"
              aria-expanded={open ? 'true' : undefined}
              onClick={handleClick}
            >
              Bet
            </Button>
          </Box>

          <Menu
            className="btn_manu"
            id="basic-menu"
            anchorEl={anchorEl}
            open={open}
            onClose={handleClose}
            MenuListProps={{
              'aria-labelledby': 'basic-button',
            }}
          >
            <Box className="ul_li_box">
              <ul>
                <li>
                  <Link href="/">Dashboard</Link>
                </li>
              </ul>
            </Box>
            <Box className="ul_li_box">
              <ul>
                <li>
                  <Link href="/active-bets">Active Bets</Link>
                </li>
              </ul>
            </Box>
            <Box className="ul_li_box">
              <ul>
                <li>
                  <Link href="/history-bets">Bets History</Link>
                </li>
              </ul>
            </Box>
          </Menu>
          <Box className={splitLocation[1] === 'farm' || splitLocation[1] === 'pool' ? 'manu_img_paert_aj active' : 'manu_img_paert_aj'}>
            <img src="/img/farm_img_aj.svg" alt="" />
            <Button
              id="basic-button"
              aria-controls={opentwo ? 'basic-menu' : undefined}
              aria-haspopup="true"
              aria-expanded={opentwo ? 'true' : undefined}
              onClick={handleClicktwo}
            >
              Farm
            </Button>
          </Box>
          <Menu
            className="btn_manu"
            id="basic-menu"
            anchorEl={anchorEltwo}
            open={opentwo}
            onClose={handleClosetwo}
            MenuListProps={{
              'aria-labelledby': 'basic-button',
            }}
          >
            <Box className="ul_li_box">
              <ul>
                <li>
                  <Link href="/farm">LP Stake</Link>
                </li>
              </ul>
            </Box>
            <Box className="ul_li_box">
              <ul>
                <li>
                  <Link href="/pool">Pool</Link>
                </li>
              </ul>
            </Box>
          </Menu>
          <Box className={splitLocation[1] === 'faq' ? 'manu_img_paert_aj active' : 'manu_img_paert_aj'}>
            <Link href="/faq" className="faq_l img_set_parnt_aj">
              <img src="/img/faq_ima_aj.svg" alt="" />
              Faq
            </Link>
          </Box>
          <Box className="manu_img_paert_aj">
            <Button
              id="basic-button"
              aria-controls={openthree ? 'basic-menu' : undefined}
              aria-haspopup="true"
              aria-expanded={openthree ? 'true' : undefined}
              onClick={handleClickthree}
              className="faq_botn_only"
            >
              <img src="/img/dot_img_aj.svg" alt="" />
              <Typography>More</Typography>
            </Button>
          </Box>
          <Menu
            className="btn_manu"
            id="basic-menu"
            anchorEl={anchorElthree}
            open={openthree}
            onClose={handleClosethree}
            MenuListProps={{
              'aria-labelledby': 'basic-button',
            }}
          >
            <Box className="ul_li_box">
              <ul>
                <li>
                  <a href="https://randomdeveloper.gitbook.io/docs.gamblefi.io/cronosports/cronosports-zero-loss-betting">Documentation</a>
                </li>
              </ul>
            </Box>
            <Box className="ul_li_box">
              <ul>
                <li>
                  <Link href="/">Twitter</Link>
                </li>
              </ul>
            </Box>
          </Menu>
        </div>
      </Box>
      <div className="header">
        <AppBar>

          {mobileView ? displayMobile() : displayDesktop()}
          <Box className="right_header">
            <Box className="head_select">
              <w3m-network-button />
            </Box>

            <Box className="hdrdvdr" />
            <w3m-button />
          </Box>
        </AppBar>
      </div>
      <Sidebar />
      <Banner />
    </>
  );
}

