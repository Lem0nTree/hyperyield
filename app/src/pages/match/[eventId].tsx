import React, { useState, useEffect } from 'react';
import { Box, Grid, Typography, Button, TextField, Checkbox, IconButton, Slider, Alert, CircularProgress } from '@mui/material';
import { useRouter } from 'next/router';
import MatchTabOne from '@/components/matchtabs/MatchTabOne';
import CoeffTab from '@/components/matchtabs/CoeffTab';
import Header from '@/components/elements/Header';
import matchesData from '@/data/matches.json';
import matchMarkets from '@/data/matchMarkets.json';
import CloseIcon from '@mui/icons-material/Close';
import { useAccount, useContractWrite, useContractRead, useWaitForTransaction } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import HyperMarketABI from '@/abi/contracts/core/HyperMarket.sol/HyperMarket.json';
import MockUSDYABI from '@/abi/contracts/mocks/MockUSDY.sol/MockUSDY.json';

// Contract addresses
const USDY_ADDRESS = '0x36ec3E9208f0B177bd72283ED54E3f3bf42c0A8e' as `0x${string}`;
const PLACEHOLDER_ADDRESS = '0x0000000000000000000000000000000000000000' as `0x${string}`;

export default function Match() {
  const router = useRouter();
  const { eventId } = router.query;
  const { address, isConnected } = useAccount();
  
  // Ensure eventId is always a string for consistency
  const eventIdString = typeof eventId === 'string' ? eventId : (Array.isArray(eventId) ? eventId[0] : '1');
  
  // Single selected bet (Barcelona, X, or Real Madrid)
  const [selectedBet, setSelectedBet] = useState<{
    id: number;
    matchName: string;
    outcome: 'Barcelona' | 'X' | 'Real Madrid';
    side: 1 | 2;
    checked: boolean;
  } | null>(null);
  
  const [betAmount, setBetAmount] = useState('100');
  const [timePeriod, setTimePeriod] = useState(6); // 2, 6, 12, or 24 months
  const [matchDetails, setMatchDetails] = useState<any>(null);
  const [marketAddress, setMarketAddress] = useState<`0x${string}` | null>(null);
  const [hyperMarketAddress, setHyperMarketAddress] = useState<`0x${string}` | null>(null);
  const [userPosition, setUserPosition] = useState<any>(null);
  const [marketInfo, setMarketInfo] = useState<any>(null);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  
  // Map months to time lock days
  const monthToDaysMap: { [key: number]: number } = {
    2: 30,
    6: 90,
    12: 180,
    24: 365,
  };

  // Get market address based on match ID and time period
  useEffect(() => {
    const match = matchesData.find((m) => m.matchID === eventIdString || m.matchID === '1');
    if (match) {
      setMatchDetails(match);
      const matchMarket = matchMarkets[eventIdString] || matchMarkets['1'];
      // Set HyperMarket address (this is where deposit function is)
      if (matchMarket?.hyperMarketAddress) {
        setHyperMarketAddress(matchMarket.hyperMarketAddress as `0x${string}`);
      }
      // Set Pendle market address (for reference/display)
      const timeLockDays = monthToDaysMap[timePeriod];
      if (matchMarket && matchMarket.markets[timeLockDays.toString()]) {
        setMarketAddress(matchMarket.markets[timeLockDays.toString()] as `0x${string}`);
      }
    } else {
      setMatchDetails(matchesData[0]);
    }
  }, [eventIdString, timePeriod]);

  // Use stable placeholder address to ensure hook consistency
  // For reading: use HyperMarket address (where the contract functions are)
  const stableHyperMarketAddress = hyperMarketAddress || PLACEHOLDER_ADDRESS;
  // For display/reference: Pendle market address
  const stableMarketAddress = marketAddress || PLACEHOLDER_ADDRESS;

  // Read market info - use HyperMarket address
  const { data: marketData, refetch: refetchMarket } = useContractRead({
    address: stableHyperMarketAddress,
    abi: HyperMarketABI.abi,
    functionName: 'market',
    enabled: !!hyperMarketAddress,
  });

  // Read user position - use HyperMarket address
  const { data: positionData, refetch: refetchPosition } = useContractRead({
    address: stableHyperMarketAddress,
    abi: HyperMarketABI.abi,
    functionName: 'positions',
    args: address ? [address] : [PLACEHOLDER_ADDRESS],
    enabled: !!hyperMarketAddress && !!address,
  });

  // Read pool stats - use HyperMarket address
  const { data: totalBP } = useContractRead({
    address: stableHyperMarketAddress,
    abi: HyperMarketABI.abi,
    functionName: 'totalBPPot',
    enabled: !!hyperMarketAddress,
  });

  const { data: yesBP } = useContractRead({
    address: stableHyperMarketAddress,
    abi: HyperMarketABI.abi,
    functionName: 'sideBPPool',
    args: [1],
    enabled: !!hyperMarketAddress,
  });

  const { data: noBP } = useContractRead({
    address: stableHyperMarketAddress,
    abi: HyperMarketABI.abi,
    functionName: 'sideBPPool',
    args: [2],
    enabled: !!hyperMarketAddress,
  });

  // Read USDY balance
  const { data: usdyBalance } = useContractRead({
    address: USDY_ADDRESS,
    abi: MockUSDYABI.abi,
    functionName: 'balanceOf',
    args: address ? [address] : [PLACEHOLDER_ADDRESS],
    enabled: !!address,
  });

  // Read USDY allowance - approve to HyperMarket address (where deposit is called)
  const { data: allowance, refetch: refetchAllowance } = useContractRead({
    address: USDY_ADDRESS,
    abi: MockUSDYABI.abi,
    functionName: 'allowance',
    args: address && hyperMarketAddress ? [address, hyperMarketAddress] : [PLACEHOLDER_ADDRESS, PLACEHOLDER_ADDRESS],
    enabled: !!address && !!hyperMarketAddress,
  });

  // Update state when contract data changes
  useEffect(() => {
    if (marketData) {
      setMarketInfo({
        underlyingToken: marketData[0],
        resolutionDate: marketData[1],
        minTimeLock: marketData[2],
        maxTimeLock: marketData[3],
        resolved: marketData[4],
        outcome: marketData[5],
      });
    }
  }, [marketData]);

  useEffect(() => {
    if (positionData) {
      setUserPosition({
        principalAmount: positionData[0],
        bettingPower: positionData[1],
        maturityDate: positionData[2],
        ptBalance: positionData[3],
        ytBalance: positionData[4],
        side: positionData[5],
        claimed: positionData[6],
      });
    }
  }, [positionData]);

  // Write contract hooks - must be called unconditionally (before any early returns)
  const { write: writeApprove, data: approveData, isLoading: isApproving } = useContractWrite({
    address: USDY_ADDRESS,
    abi: MockUSDYABI.abi,
    functionName: 'approve',
  });

  const { write: writeDeposit, data: depositData, isLoading: isDepositing, error: depositError } = useContractWrite({
    address: stableHyperMarketAddress,
    abi: HyperMarketABI.abi,
    functionName: 'deposit',
    onError: (error: any) => {
      console.error('Deposit error:', error);
      let errorMessage = 'Failed to place bet';
      
      // Try to extract revert reason
      if (error?.message) {
        errorMessage = error.message;
        // Look for revert reason in various formats
        const revertMatch = error.message.match(/revert\s+(.+)/i) || 
                           error.message.match(/execution reverted:\s*(.+)/i) ||
                           error.message.match(/reverted with reason string '(.+)'/i) ||
                           error.message.match(/reverted with custom error '(.+)'/i);
        if (revertMatch && revertMatch[1]) {
          errorMessage = revertMatch[1];
        }
      } else if (error?.reason) {
        errorMessage = error.reason;
      } else if (error?.data?.message) {
        errorMessage = error.data.message;
      } else if (error?.shortMessage) {
        errorMessage = error.shortMessage;
      }
      
      alert(`Bet placement failed: ${errorMessage}\n\nPlease check:\n- Market is not resolved\n- Time lock matches the market (${monthToDaysMap[timePeriod]} days)\n- You have sufficient USDY balance`);
      setIsPlacingBet(false);
    },
  });

  // Wait for transaction receipts
  const { isLoading: isApprovingTx, isSuccess: isApprovalSuccess } = useWaitForTransaction({
    hash: approveData?.hash,
    enabled: !!approveData?.hash,
  });

  const { isLoading: isDepositingTx, isSuccess: isDepositSuccess } = useWaitForTransaction({
    hash: depositData?.hash,
    enabled: !!depositData?.hash,
  });

  // Refetch after approval completes
  useEffect(() => {
    if (isApprovalSuccess) {
      refetchPosition();
      refetchAllowance(); // Refetch allowance to get updated value
      console.log('Approval successful, allowance will be refetched');
    }
  }, [isApprovalSuccess, refetchPosition, refetchAllowance]);

  // Refetch after deposit completes
  useEffect(() => {
    if (isDepositSuccess) {
      refetchPosition();
      refetchMarket();
      setIsPlacingBet(false);
    }
  }, [isDepositSuccess, refetchPosition, refetchMarket]);

  // Auto-deposit after approval completes - MUST be before early return
  useEffect(() => {
    // Check if approval is successful and we're waiting to deposit
    if (
      isApprovalSuccess && 
      isPlacingBet && 
      selectedBet && 
      hyperMarketAddress && 
      !depositData?.hash && // Haven't started deposit yet
      !isDepositing && // Not currently depositing
      writeDeposit &&
      allowance // Make sure we have allowance data
    ) {
      const amount = parseFloat(betAmount);
      const timeLockDays = monthToDaysMap[timePeriod];
      if (amount > 0 && timeLockDays && hyperMarketAddress) {
        const amountWei = parseUnits(betAmount, 18);
        
        // Verify allowance is sufficient
        if (allowance < amountWei) {
          console.error('Insufficient allowance:', {
            allowance: allowance.toString(),
            required: amountWei.toString()
          });
          alert(`Insufficient allowance. Please try approving again.`);
          setIsPlacingBet(false);
          return;
        }

        // Verify market is not resolved
        if (marketInfo?.resolved) {
          console.error('Market is already resolved');
          alert('This market has already been resolved. You cannot place a bet.');
          setIsPlacingBet(false);
          return;
        }

        // Verify time lock is within market range
        if (marketInfo?.minTimeLock && marketInfo?.maxTimeLock) {
          if (timeLockDays < Number(marketInfo.minTimeLock) || timeLockDays > Number(marketInfo.maxTimeLock)) {
            console.error('Time lock out of range:', {
              timeLockDays,
              minTimeLock: marketInfo.minTimeLock,
              maxTimeLock: marketInfo.maxTimeLock
            });
            alert(`Invalid time lock. Market requires ${marketInfo.minTimeLock}-${marketInfo.maxTimeLock} days, but you selected ${timeLockDays} days.`);
            setIsPlacingBet(false);
            return;
          }
        }

        console.log('Auto-depositing after approval:', { 
          amountWei: amountWei.toString(), 
          timeLockDays, 
          side: selectedBet.side,
          hyperMarketAddress,
          allowance: allowance.toString(),
          marketResolved: marketInfo?.resolved,
          minTimeLock: marketInfo?.minTimeLock,
          maxTimeLock: marketInfo?.maxTimeLock
        });
        
        try {
          writeDeposit({
            args: [amountWei, BigInt(timeLockDays), selectedBet.side],
          });
        } catch (error: any) {
          console.error('Error in auto-deposit:', error);
          const errorMessage = error?.message || error?.reason || 'Unknown error';
          alert(`Failed to place bet: ${errorMessage}`);
          setIsPlacingBet(false);
        }
      }
    }
  }, [isApprovalSuccess, isPlacingBet, selectedBet, hyperMarketAddress, depositData?.hash, isDepositing, betAmount, timePeriod, writeDeposit, allowance, marketInfo]);

  // Early return must be after ALL hooks
  if (!matchDetails) {
    return (
      <>
        <Header />
        <Box>Loading...</Box>
      </>
    );
  }

  const handleBetSelection = (outcome: 'Barcelona' | 'X' | 'Real Madrid') => {
    if (!matchDetails) return;
    // Barcelona = 1, X = 1, Real Madrid = 2
    const side = outcome === 'Real Madrid' ? 2 : 1;
    setSelectedBet({
      id: Date.now(),
      matchName: matchDetails.matchname,
      outcome,
      side,
      checked: true,
    });
  };

  const handleRemoveBet = () => {
    setSelectedBet(null);
  };

  const handlePlaceBet = async () => {
    if (!selectedBet || !hyperMarketAddress || !address || !isConnected) {
      alert('Please connect wallet and select an outcome');
      return;
    }

    const amount = parseFloat(betAmount);
    if (amount <= 0) {
      alert('Please enter a valid bet amount');
      return;
    }

    const timeLockDays = monthToDaysMap[timePeriod];
    if (!timeLockDays) {
      alert('Invalid time period');
      return;
    }

    setIsPlacingBet(true);

    try {
      const amountWei = parseUnits(betAmount, 18);
      const needsApproval = !allowance || allowance < amountWei;

      // Step 1: Approve if needed - approve to HyperMarket address
      if (needsApproval) {
        if (!hyperMarketAddress) {
          alert('HyperMarket address not found. Please refresh the page.');
          setIsPlacingBet(false);
          return;
        }
        writeApprove({
          args: [hyperMarketAddress, amountWei],
        });
        // Wait for approval transaction to complete before depositing
        // The deposit will be triggered in the useEffect that watches approveData
        return;
      }

      // Step 2: Deposit directly if already approved
      if (hyperMarketAddress && writeDeposit) {
        // Verify market is not resolved
        if (marketInfo?.resolved) {
          alert('This market has already been resolved. You cannot place a bet.');
          setIsPlacingBet(false);
          return;
        }

        // Verify allowance is sufficient
        if (allowance && allowance < amountWei) {
          alert('Insufficient allowance. Please approve again.');
          setIsPlacingBet(false);
          return;
        }

        // Verify time lock is within market range
        if (marketInfo?.minTimeLock && marketInfo?.maxTimeLock) {
          if (timeLockDays < Number(marketInfo.minTimeLock) || timeLockDays > Number(marketInfo.maxTimeLock)) {
            alert(`Invalid time lock. Market requires ${marketInfo.minTimeLock}-${marketInfo.maxTimeLock} days, but you selected ${timeLockDays} days.`);
            setIsPlacingBet(false);
            return;
          }
        }

        console.log('Placing deposit directly:', {
          amountWei: amountWei.toString(),
          timeLockDays,
          side: selectedBet.side,
          hyperMarketAddress,
          allowance: allowance?.toString(),
          minTimeLock: marketInfo?.minTimeLock,
          maxTimeLock: marketInfo?.maxTimeLock
        });

        writeDeposit({
          args: [amountWei, BigInt(timeLockDays), selectedBet.side],
        });
      }
    } catch (error: any) {
      console.error('Error placing bet:', error);
      // Extract revert reason if available
      let errorMessage = 'Failed to place bet';
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.reason) {
        errorMessage = error.reason;
      } else if (error?.data?.message) {
        errorMessage = error.data.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      alert(`Error: ${errorMessage}`);
      setIsPlacingBet(false);
    }
  };

  const handleTimePeriodChange = (newValue: number | number[]) => {
    const value = Array.isArray(newValue) ? newValue[0] : newValue;
    // Snap to nearest valid value: 2, 6, 12, or 24
    const validValues = [2, 6, 12, 24];
    const closest = validValues.reduce((prev, curr) => 
      Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
    );
    setTimePeriod(closest);
  };

  // Calculate potential winning based on pool shares
  const calculatePotentialWinning = () => {
    if (!selectedBet || !yesBP || !noBP || !totalBP) return 0;
    const amount = parseFloat(betAmount) || 0;
    if (amount === 0) return 0;
    
    // Simplified calculation - in reality, this depends on yield rates
    // For now, show the amount + estimated yield
    const estimatedYield = amount * 0.1; // 10% placeholder
    return amount + estimatedYield;
  };

  // Get time period label
  const getTimePeriodLabel = (months: number) => {
    return `${months} ${months === 1 ? 'Month' : 'Months'}`;
  };

  // Calculate redeemable date based on time period
  const getRedeemableDate = () => {
    const now = new Date();
    const redeemableDate = new Date(now);
    redeemableDate.setMonth(redeemableDate.getMonth() + timePeriod);
    return redeemableDate.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  // Calculate betting power based on time period
  const calculateBettingPower = () => {
    const amount = parseFloat(betAmount) || 0;
    // Simplified - actual BP comes from contract after deposit
    const powerMultiplier = timePeriod === 2 ? 1.0 : timePeriod === 6 ? 1.2 : timePeriod === 12 ? 1.5 : 2.0;
    return (amount * powerMultiplier).toFixed(2);
  };

  // Get user's current bet status
  const getUserBetStatus = () => {
    if (!userPosition || !userPosition.principalAmount || userPosition.principalAmount === 0n) {
      return null;
    }

    const side = userPosition.side === 1 ? 'Barcelona/X' : 'Real Madrid';
    const principal = formatUnits(userPosition.principalAmount, 18);
    const bettingPower = formatUnits(userPosition.bettingPower, 18);
    const isResolved = marketInfo?.resolved || false;
    const outcome = marketInfo?.outcome || 0;
    const won = isResolved && userPosition.side === outcome;

    return {
      side,
      principal,
      bettingPower,
      isResolved,
      won,
      claimed: userPosition.claimed,
    };
  };

  const getLeagueName = (category: string) => {
    const leagues: { [key: string]: string } = {
      '0': 'La Liga',
      '1': 'UFC Championship',
      '3': 'ATP Tour',
    };
    return leagues[category] || 'League Match';
  };

  // Calculate dates for display
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <>
      <Header />
      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <Box className="pdding0_15_respncv">
            <Box className="spain_primira_box">
              <Box className="spain_primira_head">
                <Typography component="p">{getLeagueName(matchDetails.matchcategory)}</Typography>
                <Typography component="h4">{matchDetails.matchname}</Typography>
              </Box>
              <Box 
                className="match_logo_bx"
                sx={{
                  display: 'flex !important',
                  flexDirection: 'row !important',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '20px',
                  flexWrap: 'wrap',
                  minHeight: 'auto !important',
                }}
              >
                {/* Team 1 - Left */}
                <Box 
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    flex: '1',
                    minWidth: '120px',
                  }}
                >
                  <Box className="volkski_img_prnt">
                    <Box 
                      component="img" 
                      src="/img/participants/Barcelona_0.png" 
                      alt="" 
                    />
                  </Box>
                  <Typography 
                    component="p"
                    sx={{
                      marginTop: '12px',
                      fontWeight: 600,
                      fontSize: '14px',
                      lineHeight: '17px',
                    }}
                  >
                    {matchDetails.matchpartecipant[0]}
                  </Typography>
                </Box>

                {/* VS - Center */}
                <Box 
                  className="cro_flex"
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <Typography component="h5">
                    <span>VS</span>
                  </Typography>
                </Box>

                {/* Team 2 - Right */}
                <Box 
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    flex: '1',
                    minWidth: '120px',
                  }}
                >
                  <Box className="korianzombi_img_prnt">
                    <Box 
                      component="img" 
                      src="/img/participants/RealMadrid_0.png" 
                      alt="" 
                    />
                  </Box>
                  <Typography 
                    component="p"
                    sx={{
                      marginTop: '12px',
                      fontWeight: 600,
                      fontSize: '14px',
                      lineHeight: '17px',
                    }}
                  >
                    {matchDetails.matchpartecipant[1]}
                  </Typography>
                </Box>
              </Box>
              <Box 
                className="time_data_right"
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: '20px',
                  width: '100%',
                }}
              >
                <Typography sx={{ marginBottom: '8px' }}>Start of the match</Typography>
                <Typography component='h5'>
                  {formatDate(matchDetails.date)}
                </Typography>
              </Box>
            </Box>

            <Box className="match_tabs_section" style={{ marginTop: '30px' }}>
              <MatchTabOne matchDetails={matchDetails} />
            </Box>

            <Box className="coefficients_box">
              <Typography component="h3" style={{ padding: '0 30px', marginBottom: '20px' }}>
                Select Outcome
              </Typography>
              <Box sx={{ padding: '0 30px', marginBottom: '30px' }}>
                {!isConnected && (
                  <Alert severity="info" sx={{ marginBottom: '20px' }}>
                    Please connect your wallet to place a bet
                  </Alert>
                )}
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}>
                    <Button
                      fullWidth
                      variant={selectedBet?.outcome === 'Barcelona' ? 'contained' : 'outlined'}
                      onClick={() => handleBetSelection('Barcelona')}
                      disabled={!isConnected || marketInfo?.resolved}
                      sx={{
                        height: '60px',
                        fontSize: '18px',
                        fontWeight: 700,
                        backgroundColor: selectedBet?.outcome === 'Barcelona' ? '#00d57d' : 'transparent',
                        borderColor: '#00d57d',
                        color: selectedBet?.outcome === 'Barcelona' ? '#ffffff' : '#00d57d',
                        '&:hover': {
                          backgroundColor: selectedBet?.outcome === 'Barcelona' ? '#00b86a' : 'rgba(0, 213, 125, 0.1)',
                          borderColor: '#00d57d',
                        },
                      }}
                    >
                      Barcelona
                    </Button>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Button
                      fullWidth
                      variant={selectedBet?.outcome === 'X' ? 'contained' : 'outlined'}
                      onClick={() => handleBetSelection('X')}
                      disabled={!isConnected || marketInfo?.resolved}
                      sx={{
                        height: '60px',
                        fontSize: '18px',
                        fontWeight: 700,
                        backgroundColor: selectedBet?.outcome === 'X' ? '#00d57d' : 'transparent',
                        borderColor: '#00d57d',
                        color: selectedBet?.outcome === 'X' ? '#ffffff' : '#00d57d',
                        '&:hover': {
                          backgroundColor: selectedBet?.outcome === 'X' ? '#00b86a' : 'rgba(0, 213, 125, 0.1)',
                          borderColor: '#00d57d',
                        },
                      }}
                    >
                      X
                    </Button>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Button
                      fullWidth
                      variant={selectedBet?.outcome === 'Real Madrid' ? 'contained' : 'outlined'}
                      onClick={() => handleBetSelection('Real Madrid')}
                      disabled={!isConnected || marketInfo?.resolved}
                      sx={{
                        height: '60px',
                        fontSize: '18px',
                        fontWeight: 700,
                        backgroundColor: selectedBet?.outcome === 'Real Madrid' ? '#00d57d' : 'transparent',
                        borderColor: '#00d57d',
                        color: selectedBet?.outcome === 'Real Madrid' ? '#ffffff' : '#00d57d',
                        '&:hover': {
                          backgroundColor: selectedBet?.outcome === 'Real Madrid' ? '#00b86a' : 'rgba(0, 213, 125, 0.1)',
                          borderColor: '#00d57d',
                        },
                      }}
                    >
                      Real Madrid
                    </Button>
                  </Grid>
                </Grid>
                
                {/* Pool Information */}
                {totalBP && (
                  <Box sx={{ marginTop: '30px', padding: '20px', background: 'rgba(0, 213, 125, 0.05)', borderRadius: '12px' }}>
                    <Typography component="h5" sx={{ marginBottom: '15px', fontWeight: 600 }}>
                      Pool Statistics
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <Typography component="p">Total Betting Power:</Typography>
                      <Typography component="p" sx={{ fontWeight: 600 }}>
                        {formatUnits(totalBP, 18)} USDY
                      </Typography>
                    </Box>
                    {yesBP && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <Typography component="p">Barcelona/X Pool:</Typography>
                        <Typography component="p" sx={{ fontWeight: 600, color: '#00d57d' }}>
                          {formatUnits(yesBP, 18)} USDY
                        </Typography>
                      </Box>
                    )}
                    {noBP && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <Typography component="p">Real Madrid Pool:</Typography>
                        <Typography component="p" sx={{ fontWeight: 600, color: '#00d57d' }}>
                          {formatUnits(noBP, 18)} USDY
                        </Typography>
                      </Box>
                    )}
                  </Box>
                )}

                {/* Current User Bet */}
                {getUserBetStatus() && (
                  <Box sx={{ marginTop: '20px', padding: '20px', background: 'rgba(0, 213, 125, 0.1)', borderRadius: '12px', border: '1px solid rgba(0, 213, 125, 0.3)' }}>
                    <Typography component="h5" sx={{ marginBottom: '15px', fontWeight: 600 }}>
                      Your Current Bet
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <Typography component="p">Side:</Typography>
                      <Typography component="p" sx={{ fontWeight: 600 }}>
                        {getUserBetStatus()?.side}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <Typography component="p">Principal Amount:</Typography>
                      <Typography component="p" sx={{ fontWeight: 600 }}>
                        {getUserBetStatus()?.principal} USDY
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <Typography component="p">Betting Power:</Typography>
                      <Typography component="p" sx={{ fontWeight: 600 }}>
                        {getUserBetStatus()?.bettingPower} BP
                      </Typography>
                    </Box>
                    {getUserBetStatus()?.isResolved && (
                      <Alert 
                        severity={getUserBetStatus()?.won ? 'success' : 'error'}
                        sx={{ marginTop: '10px' }}
                      >
                        {getUserBetStatus()?.won ? 'You Won!' : 'You Lost'}
                        {getUserBetStatus()?.claimed && ' (Claimed)'}
                      </Alert>
                    )}
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        </Grid>

        <Grid item xs={12} md={4}>
          <Box className="pdding0_15_respncv">
            <Box className="single_bet_box" style={{ marginBottom: '20px' }}>
              <Box className="head_txt_clean_img" style={{ marginBottom: '20px' }}>
                <Typography component="h3">Bet Slip</Typography>
                <Box component="img" src="/img/cleaner_ic.svg" alt="" />
              </Box>

              {selectedBet ? (
                <>
                  <Box style={{ marginBottom: '20px' }}>
                    <Box className="single_bet_inn01" style={{ marginBottom: '15px' }}>
                        <Box className="check_text_flex_box">
                          <Checkbox
                          checked={selectedBet.checked}
                          disabled
                            sx={{
                              color: 'rgba(0, 213, 125, 1)',
                              '&.Mui-checked': {
                                color: 'rgba(0, 213, 125, 1)',
                              },
                            }}
                          />
                        <Typography component="p">{selectedBet.matchName}</Typography>
                          <IconButton
                          onClick={handleRemoveBet}
                            sx={{ minWidth: 0, padding: 0 }}
                          >
                            <CloseIcon sx={{ fontSize: 18, color: '#5d6673' }} />
                          </IconButton>
                        </Box>
                        <Box className="outcom_flex_bx">
                          <Box className="outcom_left">
                            <Typography component="h5">
                            Outcome: <span>{selectedBet.outcome}</span>
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                  </Box>

                  <Box className="single_bet_bttm_box">
                    <Box style={{ paddingTop: '15px', paddingBottom: '15px', borderBottom: '1px solid #222831', marginBottom: '15px' }}>
                      <Typography component="h5" style={{ marginBottom: '15px', fontWeight: 600, fontSize: '18px', lineHeight: '22px', color: '#ffffff' }}>
                        Bet Amount
                      </Typography>
                      <Typography component="p" style={{ marginBottom: '10px', fontWeight: 500, fontSize: '14px', lineHeight: '18px', color: '#5d6673' }}>
                        Underlying Asset Amount
                      </Typography>
                      <TextField
                        fullWidth
                        type="number"
                        value={betAmount}
                        onChange={(e) => setBetAmount(e.target.value)}
                        InputProps={{
                          startAdornment: (
                            <Box style={{ display: 'flex', alignItems: 'center', marginRight: '12px' }}>
                              <Box
                                component="img"
                                src={`/img/tokens/${(matchDetails?.farmtoken || 'FRAX').toLowerCase()}.svg`}
                                alt=""
                                onError={(e: any) => {
                                  e.target.src = '/img/frax_ic.svg';
                                }}
                                style={{ width: '24px', height: '24px', marginRight: '8px' }}
                              />
                              <Typography component="span" style={{ color: '#ffffff', fontWeight: 600, fontSize: '14px' }}>
                                USDY
                              </Typography>
                            </Box>
                          ),
                        }}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            backgroundColor: '#282e38',
                            borderRadius: '8px',
                            color: '#ffffff',
                            '& fieldset': {
                              borderColor: '#323a46',
                            },
                            '&:hover fieldset': {
                              borderColor: '#00d57d',
                            },
                            '&.Mui-focused fieldset': {
                              borderColor: '#00d57d',
                            },
                          },
                          '& .MuiInputBase-input': {
                            color: '#ffffff',
                            padding: '12px 14px',
                          },
                        }}
                      />
                    </Box>

                    <Box className="slidr_flex_box">
                      <Box className="num_flex">
                        <Typography component="h5">Underlying Future Yield Lock</Typography>
                        <Typography component="h5">{monthToDaysMap[timePeriod]} Days</Typography>
                      </Box>
                      <Slider
                        value={timePeriod}
                        onChange={(e, newValue) => handleTimePeriodChange(newValue)}
                        min={2}
                        max={24}
                        step={1}
                        marks={[
                          { value: 2, label: '30D' },
                          { value: 6, label: '90D' },
                          { value: 12, label: '180D' },
                          { value: 24, label: '365D' },
                        ]}
                        sx={{
                          marginTop: '15px',
                          '& .MuiSlider-rail': {
                            background: '#222831',
                          },
                          '& .MuiSlider-track': {
                            background: 'rgba(0, 213, 125, 0.2)',
                            border: 'none',
                          },
                          '& .MuiSlider-thumb': {
                            width: 32,
                            height: 32,
                            background: '#00d57d',
                            boxShadow: 'none',
                          },
                          '& .MuiSlider-markLabel': {
                            color: '#5d6673',
                            fontSize: '12px',
                            fontWeight: 600,
                          },
                          '& .MuiSlider-mark': {
                            backgroundColor: '#5d6673',
                            width: '4px',
                            height: '4px',
                            borderRadius: '50%',
                          },
                          '& .MuiSlider-markActive': {
                            backgroundColor: '#00d57d',
                          },
                        }}
                      />
                    </Box>

                    <Box className="bet_bttm_cnter_bx">
                      <Box className="bttm_cnter_row">
                        <Typography component="p">Betting Power</Typography>
                        <Typography component="p">{calculateBettingPower()} BP</Typography>
                      </Box>
                      <Box className="bttm_cnter_row">
                        <Typography component="p">Potential Winning</Typography>
                        <Typography component="p" style={{ color: '#00d57d' }}>
                          {calculatePotentialWinning().toFixed(2)} USDY
                        </Typography>
                      </Box>
                      <Box className="bttm_cnter_row">
                        <Typography component="p">Payout</Typography>
                        <Typography component="p">
                          {parseFloat(betAmount) > 0 
                            ? (((calculatePotentialWinning() - parseFloat(betAmount)) / parseFloat(betAmount)) * 100).toFixed(1)
                            : '0.0'}%
                        </Typography>
                      </Box>
                      
                      <Box
                        sx={{
                          marginTop: '20px',
                          marginBottom: '15px',
                          padding: '16px',
                          background: 'linear-gradient(135deg, rgba(0, 213, 125, 0.12) 0%, rgba(0, 213, 125, 0.06) 100%)',
                          border: '1px solid rgba(0, 213, 125, 0.2)',
                          borderRadius: '12px',
                          position: 'relative',
                          overflow: 'hidden',
                          '&::before': {
                            content: '""',
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '4px',
                            height: '100%',
                            background: '#00d57d',
                          },
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                          <Box
                            component="img"
                            src="/img/i_140_img_ppup.svg"
                            alt=""
                            sx={{
                              width: '20px',
                              height: '20px',
                              marginTop: '2px',
                              flexShrink: 0,
                            }}
                          />
                          <Box sx={{ flex: 1 }}>
                            <Typography
                              component="p"
                              sx={{
                                fontWeight: 600,
                                fontSize: '14px',
                                lineHeight: '20px',
                                color: '#ffffff',
                                marginBottom: '8px',
                              }}
                            >
                              By placing this bet, you agree to bet your future yield on your RWA asset.
                            </Typography>
                            <Typography
                              component="p"
                              sx={{
                                fontWeight: 400,
                                fontSize: '13px',
                                lineHeight: '18px',
                                color: '#9ca3af',
                              }}
                            >
                              In case of a lost bet, you will receive the underlying RWA asset with a redeemable date on Pendle on{' '}
                              <Box
                                component="span"
                                sx={{
                                  color: '#00d57d',
                                  fontWeight: 600,
                                }}
                              >
                                {getRedeemableDate()}
                              </Box>
                              {' '}(based on your {getTimePeriodLabel(timePeriod).toLowerCase()} future yield lock period).
                            </Typography>
                          </Box>
                        </Box>
                      </Box>

                      <Button
                        fullWidth
                        onClick={handlePlaceBet}
                        disabled={
                          !selectedBet || 
                          !isConnected || 
                          parseFloat(betAmount) === 0 || 
                          (isPlacingBet && !isApprovalSuccess && !depositData?.hash) || 
                          isApproving || 
                          isDepositing ||
                          isApprovingTx ||
                          isDepositingTx ||
                          marketInfo?.resolved
                        }
                        sx={{
                          height: '48px',
                          background: '#00d57d',
                          borderRadius: '8px',
                          fontWeight: 600,
                          fontSize: '14px',
                          lineHeight: '18px',
                          color: '#ffffff',
                          marginTop: '15px',
                          '&:disabled': {
                            background: '#5d6673',
                            color: '#ffffff',
                          },
                        }}
                      >
                        {(isApproving || isApprovingTx) ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <CircularProgress size={20} sx={{ color: '#ffffff' }} />
                            Approving...
                          </Box>
                        ) : (isDepositing || isDepositingTx || (isPlacingBet && isApprovalSuccess)) ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <CircularProgress size={20} sx={{ color: '#ffffff' }} />
                            Placing Bet...
                          </Box>
                        ) : (
                          'Place Bet'
                        )}
                      </Button>
                      
                      {usdyBalance !== undefined && (
                        <Typography 
                          component="p" 
                          sx={{ 
                            marginTop: '10px', 
                            fontSize: '12px', 
                            color: '#9ca3af',
                            textAlign: 'center'
                          }}
                        >
                          Balance: {formatUnits(usdyBalance, 18)} USDY
                        </Typography>
                      )}
                    </Box>

                    <Box
                      sx={{
                        marginTop: '24px',
                        padding: '16px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '12px',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <Typography
                          component="p"
                          sx={{
                            fontWeight: 500,
                            fontSize: '12px',
                            lineHeight: '16px',
                            color: '#9ca3af',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                          }}
                        >
                          Powered by Pendle
                        </Typography>
                        <Box
                          sx={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '4px',
                            background: 'linear-gradient(135deg, #00d57d 0%, #00b86a 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            fontWeight: 700,
                            color: '#ffffff',
                          }}
                        >
                          P
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <Typography
                          component="p"
                          sx={{
                            fontWeight: 400,
                            fontSize: '12px',
                            lineHeight: '16px',
                            color: '#9ca3af',
                          }}
                        >
                          When you bet your RWA asset, it gets split into:
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px', marginLeft: '8px' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Box
                              sx={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: '#00d57d',
                              }}
                            />
                            <Typography
                              component="span"
                              sx={{
                                fontWeight: 600,
                                fontSize: '12px',
                                lineHeight: '16px',
                                color: '#ffffff',
                              }}
                            >
                              PT (Principal Token)
                            </Typography>
                            <Typography
                              component="span"
                              sx={{
                                fontWeight: 400,
                                fontSize: '12px',
                                lineHeight: '16px',
                                color: '#9ca3af',
                                marginLeft: '4px',
                              }}
                            >
                              - principal stripped of yield
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Box
                              sx={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: '#00d57d',
                              }}
                            />
                            <Typography
                              component="span"
                              sx={{
                                fontWeight: 600,
                                fontSize: '12px',
                                lineHeight: '16px',
                                color: '#ffffff',
                              }}
                            >
                              YT (Yield Token)
                            </Typography>
                            <Typography
                              component="span"
                              sx={{
                                fontWeight: 400,
                                fontSize: '12px',
                                lineHeight: '16px',
                                color: '#9ca3af',
                                marginLeft: '4px',
                              }}
                            >
                              - future yield rights
                            </Typography>
                          </Box>
                        </Box>
                        <Box
                          sx={{
                            marginTop: '8px',
                            padding: '10px',
                            background: 'rgba(0, 213, 125, 0.08)',
                            borderRadius: '8px',
                            borderLeft: '3px solid #00d57d',
                          }}
                        >
                          <Typography
                            component="p"
                            sx={{
                              fontWeight: 400,
                              fontSize: '12px',
                              lineHeight: '16px',
                              color: '#9ca3af',
                            }}
                          >
                            <Box
                              component="span"
                              sx={{
                                fontWeight: 600,
                                color: '#ffffff',
                              }}
                            >
                              If you lose:
                            </Box>
                            {' '}You receive PT (principal without yield) redeemable on Pendle on{' '}
                            <Box
                              component="span"
                              sx={{
                                color: '#00d57d',
                                fontWeight: 600,
                              }}
                            >
                              {getRedeemableDate()}
                            </Box>
                            .
                          </Typography>
                          <Typography
                            component="p"
                            sx={{
                              fontWeight: 400,
                              fontSize: '12px',
                              lineHeight: '16px',
                              color: '#9ca3af',
                              marginTop: '6px',
                            }}
                          >
                            <Box
                              component="span"
                              sx={{
                                fontWeight: 600,
                                color: '#ffffff',
                              }}
                            >
                              If you win:
                            </Box>
                            {' '}You receive PT plus extra future yields from YT.
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  </Box>
                </>
              ) : (
                <Box className="nobet_bx">
                  <Box component="img" src="/img/allert_ic.svg" alt="" />
                  <Typography component="p">No bets selected. Select a bet option to add to your bet slip.</Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Grid>
      </Grid>
    </>
  );
}

