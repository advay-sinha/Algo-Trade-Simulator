import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

// Icons
const SearchIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const TrendingUpIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
  </svg>
);

const TrendingDownIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
  </svg>
);

const WatchlistIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
  </svg>
);

const NewsIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

const NotificationIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const SettingsIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const CompareIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

const API_BASE_URL = 'http://localhost:8000';

function Trading() {
  const [symbol, setSymbol] = useState('');
  const [stockData, setStockData] = useState(null);
  const [technicalData, setTechnicalData] = useState(null);
  const [companyInfo, setCompanyInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [news, setNews] = useState([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState('1D');
  const [priceHistory, setPriceHistory] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [compareSymbol, setCompareSymbol] = useState('');
  const [compareMode, setCompareMode] = useState(false);
  const [comparedData, setComparedData] = useState(null);
  const [priceAlerts, setPriceAlerts] = useState([]);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [newAlertPrice, setNewAlertPrice] = useState('');
  const [darkMode, setDarkMode] = useState(true);
  const [chartType, setChartType] = useState('line');
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [showRecentSearches, setShowRecentSearches] = useState(false);

  // Load saved data from localStorage
  useEffect(() => {
    const savedWatchlist = localStorage.getItem('stockWatchlist');
    const savedRecent = localStorage.getItem('recentSearches');
    const savedAlerts = localStorage.getItem('priceAlerts');
    const savedDarkMode = localStorage.getItem('darkMode');
    
    if (savedWatchlist) setWatchlist(JSON.parse(savedWatchlist));
    if (savedRecent) setRecentSearches(JSON.parse(savedRecent));
    if (savedAlerts) setPriceAlerts(JSON.parse(savedAlerts));
    if (savedDarkMode !== null) setDarkMode(JSON.parse(savedDarkMode));
  }, []);

  // Save data to localStorage
  useEffect(() => {
    localStorage.setItem('stockWatchlist', JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    localStorage.setItem('recentSearches', JSON.stringify(recentSearches));
  }, [recentSearches]);

  useEffect(() => {
    localStorage.setItem('priceAlerts', JSON.stringify(priceAlerts));
  }, [priceAlerts]);

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  // Check price alerts when stockData changes
  useEffect(() => {
    if (stockData && priceAlerts.length > 0) {
      const currentSymbol = stockData.symbol;
      const currentPrice = stockData.price;
      
      priceAlerts.forEach(alert => {
        if (alert.symbol === currentSymbol) {
          if (alert.type === 'above' && currentPrice > alert.price) {
            notifyUser(`${currentSymbol} is now above $${alert.price}`);
            // Remove triggered alert
            setPriceAlerts(prev => prev.filter(a => a.id !== alert.id));
          } else if (alert.type === 'below' && currentPrice < alert.price) {
            notifyUser(`${currentSymbol} is now below $${alert.price}`);
            // Remove triggered alert
            setPriceAlerts(prev => prev.filter(a => a.id !== alert.id));
          }
        }
      });
    }
  }, [stockData, priceAlerts]);

  // Fetch news when symbol changes
  useEffect(() => {
    if (symbol) {
      fetchNews();
    }
  }, [symbol]);

  // Update the fetchStockData function to handle errors better
  const fetchStockData = async () => {
    if (!symbol) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const [stockResponse, technicalResponse, infoResponse, historyResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/stock/${symbol}`),
        axios.get(`${API_BASE_URL}/stock/${symbol}/technical`),
        axios.get(`${API_BASE_URL}/stock/${symbol}/info`),
        axios.get(`${API_BASE_URL}/stock/${symbol}/history?timeframe=${selectedTimeframe}`)
      ]);
  
      setStockData(stockResponse.data);
      setTechnicalData(technicalResponse.data);
      setCompanyInfo(infoResponse.data);
      setPriceHistory(historyResponse.data);
      
      // Add to recent searches
      addToRecentSearches(symbol);
      
      // Render chart with the new data
      if (historyResponse.data && historyResponse.data.length > 0) {
        renderChart(historyResponse.data, compareMode ? comparedData : null);
      } else {
        setError('No historical data available for this symbol');
      }
    } catch (err) {
      console.error('Error fetching stock data:', err);
      setError(err.response?.data?.detail || 'Error fetching stock data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchCompareData = async () => {
    if (!compareSymbol) return;
    
    try {
      const response = await axios.get(`${API_BASE_URL}/stock/${compareSymbol}/history?timeframe=${selectedTimeframe}`);
      setComparedData(response.data);
      
      // Re-render chart with comparison data
      if (priceHistory && priceHistory.length > 0) {
        renderChart(priceHistory, response.data);
      }
    } catch (err) {
      console.error('Error fetching comparison data:', err);
      setError(`Error fetching data for ${compareSymbol}`);
    }
  };

  const fetchNews = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/stock/${symbol}/news`);
      setNews(response.data || []);
    } catch (err) {
      console.error('Error fetching news:', err);
      // Don't set error state for news to avoid blocking other functionality
    }
  };

  // Handle timeframe change
  useEffect(() => {
    if (symbol) {
      const fetchHistoricalData = async () => {
        try {
          const response = await axios.get(`${API_BASE_URL}/stock/${symbol}/history?timeframe=${selectedTimeframe}`);
          setPriceHistory(response.data);
          fetchNews()
          if (response.data && response.data.length > 0) {
            renderChart(response.data, compareMode ? comparedData : null);
          }
          
          // Also update comparison data if in compare mode
          if (compareMode && compareSymbol) {
            fetchCompareData();
          }
        } catch (err) {
          console.error('Error fetching historical data:', err);
        }
      };
      
      fetchHistoricalData();
    }
  }, [selectedTimeframe]);
  
  // Add WebSocket connection handling
  useEffect(() => {
    if (!symbol) return;
  
    const ws = new WebSocket(`ws://localhost:8000/ws/${symbol}`);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.error) {
        console.error('WebSocket error:', data.error);
        return;
      }
      
      // Update stock data with real-time updates
      setStockData(prev => ({
        ...prev,
        price: data.price,
        change: data.change,
        change_percent: data.change_percent,
        volume: data.volume,
        timestamp: new Date(data.timestamp)
      }));
      
      // Update watchlist item if it exists
      setWatchlist(prev => {
        return prev.map(item => {
          if (item.symbol === symbol) {
            return {
              ...item,
              price: data.price,
              change: data.change
            };
          }
          return item;
        });
      });
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };
    
    return () => {
      ws.close();
    };
  }, [symbol]);

  const renderChart = (data, compareData = null) => {
    if (!data || data.length === 0) {
      console.error('No data available for chart');
      return;
    }
  
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }
  
    const ctx = chartRef.current.getContext('2d');
    
    // Format timestamps for display
    const formattedLabels = data.map(d => {
      const date = new Date(d.timestamp);
      
      // Format based on timeframe
      if (selectedTimeframe === '1D') {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (selectedTimeframe === '1W' || selectedTimeframe === '1M') {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      } else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' });
      }
    });
    
    const datasets = [{
      label: symbol,
      data: data.map(d => d.price),
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      fill: chartType === 'area',
      tension: 0.4,
      pointRadius: data.length > 50 ? 0 : 2,
      borderWidth: 2
    }];
    
    // Add comparison data if available
    if (compareData && compareData.length > 0) {
      datasets.push({
        label: compareSymbol,
        data: compareData.map(d => d.price),
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: chartType === 'area',
        tension: 0.4,
        pointRadius: compareData.length > 50 ? 0 : 2,
        borderWidth: 2
      });
    }
  
    chartInstance.current = new Chart(ctx, {
      type: chartType === 'candle' ? 'candlestick' : 'line',
      data: {
        labels: formattedLabels,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: {
            display: compareMode,
            position: 'top',
            labels: {
              color: darkMode ? '#e2e8f0' : '#1e293b'
            }
          },
          title: {
            display: true,
            text: compareMode 
              ? `${symbol} vs ${compareSymbol} Comparison` 
              : `${symbol} Price History`,
            color: darkMode ? '#e2e8f0' : '#1e293b',
            font: {
              size: 16
            }
          },
          tooltip: {
            backgroundColor: darkMode ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.8)',
            titleColor: darkMode ? '#e2e8f0' : '#1e293b',
            bodyColor: darkMode ? '#e2e8f0' : '#1e293b',
            padding: 12,
            displayColors: compareMode,
            callbacks: {
              label: function(context) {
                const label = context.dataset.label || '';
                return `${label}: $${context.parsed.y.toFixed(2)}`;
              }
            }
          }
        },
        scales: {
          y: {
            grid: {
              color: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
              drawBorder: false
            },
            ticks: {
              color: darkMode ? '#e2e8f0' : '#1e293b',
              callback: function(value) {
                return '$' + value.toFixed(2);
              }
            }
          },
          x: {
            grid: {
              display: false
            },
            ticks: {
              color: darkMode ? '#e2e8f0' : '#1e293b',
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 10
            }
          }
        }
      }
    });
  };

  const toggleWatchlist = () => {
    if (!stockData) return;
    
    setWatchlist(prev => {
      const exists = prev.some(item => item.symbol === symbol);
      if (exists) {
        return prev.filter(item => item.symbol !== symbol);
      }
      return [...prev, { 
        symbol, 
        price: stockData.price, 
        change: stockData.change,
        name: companyInfo?.name || symbol
      }];
    });
  };

  const isInWatchlist = () => {
    return watchlist.some(item => item.symbol === symbol);
  };
  
  const addToRecentSearches = (sym) => {
    if (!sym) return;
    
    setRecentSearches(prev => {
      // Remove if already exists
      const filtered = prev.filter(s => s !== sym);
      // Add to beginning and limit to 5
      return [sym, ...filtered].slice(0, 5);
    });
  };
  
  const handleCompareToggle = () => {
    setCompareMode(!compareMode);
    if (!compareMode) {
      // Just enabled compare mode
      setCompareSymbol('');
      setComparedData(null);
    } else {
      // Just disabled compare mode
      renderChart(priceHistory);
    }
  };
  
  const handleCompareSearch = () => {
    if (compareSymbol) {
      fetchCompareData();
    }
  };
  
  const addPriceAlert = () => {
    if (!stockData || !newAlertPrice) return;
    
    const price = parseFloat(newAlertPrice);
    if (isNaN(price)) return;
    
    const alertType = price > stockData.price ? 'above' : 'below';
    
    setPriceAlerts(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        symbol,
        price,
        type: alertType,
        created: new Date().toISOString()
      }
    ]);
    
    setShowAlertModal(false);
    setNewAlertPrice('');
    
    notifyUser(`Alert set for ${symbol} when price goes ${alertType} $${price}`);
  };
  
  const removePriceAlert = (id) => {
    setPriceAlerts(prev => prev.filter(alert => alert.id !== id));
  };
  
  const notifyUser = (message) => {
    // Check if browser supports notifications
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification('Stock Alert', { body: message });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            new Notification('Stock Alert', { body: message });
          }
        });
      }
    }
    
    // Also display an alert for browsers without notification support
    alert(message);
  };
  


  return (
    <div className={`min-h-full ${darkMode ? 'bg-black text-slate-100' : 'bg-slate-100 text-slate-900'}`}>
      {/* Header */}
      <header className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} border-b`}>
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <h1 className={`text-2xl font-bold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>Stock Trading Dashboard</h1>
            <div className="flex items-center gap-4">
              
              <button 
                onClick={() => setShowAlertModal(true)}
                disabled={!stockData}
                className={`p-2 rounded-full ${darkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-200 hover:bg-slate-300'} ${!stockData ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <NotificationIcon className="w-5 h-5" />
              </button>
              <button 
                onClick={handleCompareToggle}
                className={`p-2 rounded-full ${compareMode ? 'bg-blue-600 text-white' : darkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-200 hover:bg-slate-300'}`}
              >
                <CompareIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Search Section */}
        <div className="px-4 py-4 sm:px-0">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                onFocus={() => setShowRecentSearches(true)}
                onBlur={() => setTimeout(() => setShowRecentSearches(false), 200)}
                placeholder="Enter stock symbol (e.g., AAPL)"
                className={`w-full p-3 pl-10 ${
                  darkMode 
                    ? 'bg-slate-800 text-slate-100 border-slate-700' 
                    : 'bg-white text-slate-900 border-slate-300'
                } border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
              <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              
              {/* Recent searches dropdown */}
              {showRecentSearches && recentSearches.length > 0 && (
                <div className={`absolute top-12 left-0 w-full z-10 ${
                  darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-300'
                } border rounded-lg shadow-lg`}>
                  <div className="p-2 text-sm font-medium text-slate-400">Recent Searches</div>
                  {recentSearches.map(s => (
                    <div 
                      key={s} 
                      className={`p-2 cursor-pointer ${
                        darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
                      }`}
                      onClick={() => {
                        setSymbol(s);
                        setShowRecentSearches(false);
                        setTimeout(() => fetchStockData(), 0);
                      }}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={fetchStockData}
              disabled={loading || !symbol}
              className={`px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {loading ? 'Loading...' : 'Search'}
            </button>
            
          </div>
          
          {/* Compare stock input (visible only in compare mode) */}
          {compareMode && (
            <div className="mt-4 flex gap-4">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={compareSymbol}
                  onChange={(e) => setCompareSymbol(e.target.value.toUpperCase())}
                  placeholder="Enter symbol to compare (e.g., MSFT)"
                  className={`w-full p-3 pl-10 ${
                    darkMode 
                      ? 'bg-slate-800 text-slate-100 border-slate-700' 
                      : 'bg-white text-slate-900 border-slate-300'
                  } border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                <CompareIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              </div>
              <button
                onClick={handleCompareSearch}
                disabled={!compareSymbol}
                className={`px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Compare
              </button>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="px-4 py-4 sm:px-0">
            <div className={`rounded-lg ${darkMode ? 'bg-red-900/50 border-red-500' : 'bg-red-100 border-red-300'} p-4 border`}>
              <div className={`text-sm ${darkMode ? 'text-red-200' : 'text-red-800'}`}>{error}</div>
            </div>
          </div>
        )}
        {/* Stock Data Display */}
        {stockData && (
          <div className="px-4 py-6 sm:px-0">
            <div className={`grid md:grid-cols-3 gap-6`}>
              {/* Main Stock Info */}
              <div className={`col-span-2 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} rounded-lg shadow p-6 border`}>
              <div className="flex justify-between items-start">
  <div>
    <h2 className="text-2xl font-bold">{companyInfo?.name || symbol}</h2>
    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
      {symbol} • {companyInfo?.exchange || 'Exchange'}
    </p>
  </div>
  <div className="text-right">
    <div className="text-3xl font-bold">
      ${stockData?.price !== undefined ? stockData.price.toFixed(2) : 'N/A'}
    </div>
    <div className={`flex items-center ${stockData?.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
      {stockData?.change >= 0 ? <TrendingUpIcon className="w-4 h-4 mr-1" /> : <TrendingDownIcon className="w-4 h-4 mr-1" />}
      <span>
        {stockData?.change !== undefined ? stockData.change.toFixed(2) : 'N/A'} (
        {stockData?.change_percent !== undefined ? stockData.change_percent.toFixed(2) : 'N/A'}%)
      </span>
    </div>
  </div>
</div>
                
                {/* Chart Type Selector */}
                <div className="mt-4 mb-2 flex justify-between items-center">
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => setSelectedTimeframe('1D')}
                      className={`px-3 py-1 rounded-md text-sm ${
                        selectedTimeframe === '1D' 
                          ? 'bg-blue-600 text-white' 
                          : darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      1D
                    </button>
                    <button 
                      onClick={() => setSelectedTimeframe('1W')}
                      className={`px-3 py-1 rounded-md text-sm ${
                        selectedTimeframe === '1W' 
                          ? 'bg-blue-600 text-white' 
                          : darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      1W
                    </button>
                    <button 
                      onClick={() => setSelectedTimeframe('1M')}
                      className={`px-3 py-1 rounded-md text-sm ${
                        selectedTimeframe === '1M' 
                          ? 'bg-blue-600 text-white' 
                          : darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      1M
                    </button>
                    <button 
                      onClick={() => setSelectedTimeframe('3M')}
                      className={`px-3 py-1 rounded-md text-sm ${
                        selectedTimeframe === '3M' 
                          ? 'bg-blue-600 text-white' 
                          : darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      3M
                    </button>
                    <button 
                      onClick={() => setSelectedTimeframe('1Y')}
                      className={`px-3 py-1 rounded-md text-sm ${
                        selectedTimeframe === '1Y' 
                          ? 'bg-blue-600 text-white' 
                          : darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      1Y
                    </button>
                  </div>
                  
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => setChartType('line')}
                      className={`px-3 py-1 rounded-md text-sm ${
                        chartType === 'line' 
                          ? 'bg-blue-600 text-white' 
                          : darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      Line
                    </button>
                    <button 
                      onClick={() => setChartType('area')}
                      className={`px-3 py-1 rounded-md text-sm ${
                        chartType === 'area' 
                          ? 'bg-blue-600 text-white' 
                          : darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      Area
                    </button>
                    <button 
                      onClick={() => setChartType('candle')}
                      className={`px-3 py-1 rounded-md text-sm ${
                        chartType === 'candle' 
                          ? 'bg-blue-600 text-white' 
                          : darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      Candle
                    </button>
                  </div>
                </div>
                
                {/* Chart Canvas */}
                <div className="h-64 md:h-80">
                  <canvas ref={chartRef} className="w-full h-full"></canvas>
                </div>
                
                {/* Trading Volume */}
                <div className={`mt-4 p-3 rounded-md ${darkMode ? 'bg-slate-700/50' : 'bg-slate-100'}`}>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Volume</p>
                      <p className="font-semibold">{stockData?.volume ? stockData.volume.toLocaleString() : 'N/A'}</p>
                    </div>
                    <div>
                      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Avg. Volume (30d)</p>
                      <p className="font-semibold">{technicalData?.avg_volume_30d ? technicalData.avg_volume_30d.toLocaleString() : 'N/A'}</p>
                    </div>
                    <div>
                      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Last updated</p>
                      <p className="font-semibold">{stockData?.timestamp ? new Date(stockData.timestamp).toLocaleTimeString() : 'N/A'}</p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Technical Analysis & Company Info */}
              <div className="space-y-6">
                <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} rounded-lg shadow p-6 border`}>
                  <h3 className="text-lg font-semibold mb-4">Technical Indicators</h3>
                  
                  {technicalData ? (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>RSI (14)</span>
                        <span className={`font-medium ${
                          technicalData.rsi < 30 ? 'text-red-500' : 
                          technicalData.rsi > 70 ? 'text-green-500' : 
                          darkMode ? 'text-slate-200' : 'text-slate-800'
                        }`}>
                          {technicalData.rsi !== undefined ? technicalData.rsi.toFixed(2) : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>MACD</span>
                        <span className={`font-medium ${
                          technicalData.macd > 0 ? 'text-green-500' : 'text-red-500'
                        }`}>
                          {technicalData.macd !== undefined ? technicalData.macd.toFixed(2) : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>SMA (50)</span>
                        <span className="font-medium">{technicalData.sma_50 !== undefined ? technicalData.sma_50.toFixed(2) : 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>SMA (200)</span>
                        <span className="font-medium">{technicalData.sma_200 !== undefined ? technicalData.sma_200.toFixed(2) : 'N/A'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Bollinger Bands</span>
                        <span className="font-medium text-xs">
                          U: {technicalData.bollinger_upper !== undefined ? technicalData.bollinger_upper.toFixed(2) : 'N/A'} |
                          L: {technicalData.bollinger_lower !== undefined ? technicalData.bollinger_lower.toFixed(2) : 'N/A'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className={`${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Technical data not available</p>
                  )}
                </div>
                
                <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} rounded-lg shadow p-6 border`}>
                  <h3 className="text-lg font-semibold mb-4">Company Info</h3>
                  
                  {companyInfo ? (
                    <div className="space-y-3">
                      <div>
                        <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Sector</p>
                        <p className="font-medium">{companyInfo.sector || 'N/A'}</p>
                      </div>
                      <div>
                        <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Industry</p>
                        <p className="font-medium">{companyInfo.industry || 'N/A'}</p>
                      </div>
                      <div>
                        <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Market Cap</p>
                        <p className="font-medium">${companyInfo.market_cap ? (companyInfo.market_cap / 1000000000).toFixed(2) + 'B' : 'N/A'}</p>
                      </div>
                      <div>
                        <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>P/E Ratio</p>
                        <p className="font-medium">{companyInfo.pe_ratio !== undefined ? companyInfo.pe_ratio.toFixed(2) : 'N/A'}</p>
                      </div>
                      <div>
                        <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Dividend Yield</p>
                        <p className="font-medium">{companyInfo.dividend_yield ? `${(companyInfo.dividend_yield * 100).toFixed(2)}%` : 'N/A'}</p>
                      </div>
                    </div>
                  ) : (
                    <p className={`${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Company info not available</p>
                  )}
                </div>
              </div>
            </div>
            
            {/* News Section */}
            
          </div>
        )}
        
        {/* Watchlist */}
        
        
        {/* Price Alerts */}
        <div className="px-4 py-6 sm:px-0">
          <div className={`${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} rounded-lg shadow p-6 border`}>
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <NotificationIcon className="w-5 h-5 mr-2" />
              Price Alerts
            </h3>
            
            {priceAlerts.length > 0 ? (
              <div className="space-y-3">
                {priceAlerts.map((alert) => (
                  <div key={alert.id} className={`flex items-center justify-between p-3 rounded-lg ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                    <div>
                      <div className="font-medium">{alert.symbol}</div>
                      <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Alert when price goes {alert.type} ${alert.price !== undefined ? alert.price.toFixed(2) : 'N/A'}
                      </div>
                    </div>
                    <button 
                      onClick={() => removePriceAlert(alert.id)}
                      className="p-1 text-red-500 hover:text-red-700"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className={`${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>No price alerts set. Search for a stock and click the notification button to set an alert.</p>
            )}
          </div>
        </div>
      </main>
      
      {/* Price Alert Modal */}
      {showAlertModal && (
        <div className="fixed inset-0 overflow-y-auto z-50 flex items-center justify-center">
          <div className="fixed inset-0 transition-opacity" onClick={() => setShowAlertModal(false)}>
            <div className="absolute inset-0 bg-black opacity-50"></div>
          </div>
          
          <div className={`relative max-w-md w-full ${darkMode ? 'bg-slate-800' : 'bg-white'} rounded-lg shadow-xl transition-all p-6`}>
            <h3 className="text-lg font-semibold mb-4">Set Price Alert for {symbol}</h3>
            
            <div className="mb-4">
              <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'} mb-1`}>
                Alert Price
              </label>
              <input
                type="number"
                value={newAlertPrice}
                onChange={(e) => setNewAlertPrice(e.target.value)}
                placeholder={`Current: $${stockData?.price.toFixed(2) || 0}`}
                className={`w-full p-2 ${
                  darkMode 
                    ? 'bg-slate-700 text-slate-100 border-slate-600' 
                    : 'bg-white text-slate-900 border-slate-300'
                } border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
              
              {newAlertPrice && stockData && (
                <p className="mt-2 text-sm text-blue-500">
                  Alert will trigger when price goes 
                  {parseFloat(newAlertPrice) > stockData.price ? ' above ' : ' below '}
                  ${parseFloat(newAlertPrice).toFixed(2)}
                </p>
              )}
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowAlertModal(false)}
                className={`px-4 py-2 ${
                  darkMode 
                    ? 'bg-slate-700 hover:bg-slate-600' 
                    : 'bg-slate-200 hover:bg-slate-300'
                } rounded-lg focus:outline-none`}
              >
                Cancel
              </button>
              <button
                onClick={addPriceAlert}
                disabled={!newAlertPrice}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Set Alert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Trading;