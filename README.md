# Algo Trade Simulator

A comprehensive algorithmic trading simulator that allows users to practice trading strategies with live market data in a risk-free environment.

![Algo Trade Simulator]

## Features

- **Live Market Data**: Fetch and display real-time market data
- **Stock Comparison**: Compare multiple stocks and their performance metrics
- **Virtual Trading**: Place pseudo trades without real financial risk
- **Strategy Recommendations**: Built-in chatbot to suggest algorithmic trading strategies
- **User Authentication**: Secure login and authentication system
- **Portfolio Tracking**: Monitor your virtual investment portfolio

## Tech Stack

- **Frontend**: React, Tailwind CSS
- **Backend**:
  - Node.js for API services
  - Python for market data processing
  - Java for authentication services
- **Data Sources**: Real-time market APIs
- **Database**: SQL database for user data and transaction history

## Project Structure

```
Algo-Trade-Simulator/
├── .gitignore
├── .vscode/
│   └── settings.json
├── app/
│   ├── __pycache__/
│   │   ├── botpress_webhook.cpython-313.pyc
│   │   ├── main.cpython-313.pyc
│   │   ├── simulation.cpython-313.pyc
│   │   ├── trading_endpoints.cpython-313.pyc
│   │   └── Trading.cpython-313.pyc
│   ├── botpress_webhook.py
│   ├── main.py
│   ├── requirements.txt
│   ├── simulation.py
│   ├── trading_endpoints.py
│   └── Trading.py
├── client/
│   ├── index.html
│   └── src/
│       ├── App.tsx
│       ├── components/
│       │   ├── dashboard/
│       │   │   ├── active-simulations.tsx
│       │   │   ├── asset-allocation-chart.tsx
│       │   │   ├── BotpressChat.tsx
│       │   │   ├── market-overview.tsx
│       │   │   ├── metrics-card.tsx
│       │   │   ├── performance-chart.tsx
│       │   │   ├── recent-trades.tsx
│       │   │   ├── stats-card.tsx
│       │   │   ├── trade-activity.tsx
│       │   │   └── watchlist.tsx
│       │   ├── layout/
│       │   │   ├── layout.tsx
│       │   │   └── sidebar.tsx
│       │   ├── layouts/
│       │   │   └── dashboard-layout.tsx
│       │   ├── market/
│       │   │   ├── market-data-table.tsx
│       │   │   ├── market-movers.tsx
│       │   │   └── market-search.tsx
│       │   ├── market-summary-card.tsx
│       │   ├── performance/
│       │   │   ├── asset-performance.tsx
│       │   │   ├── performance-chart.tsx
│       │   │   ├── performance-summary.tsx
│       │   │   └── strategy-comparison.tsx
│       │   ├── simulation/
│       │   │   ├── active-simulation.tsx
│       │   │   ├── simulation-setup.tsx
│       │   │   └── strategy-parameters.tsx
│       │   ├── simulator/
│       │   │   ├── strategy-description.tsx
│       │   │   ├── strategy-form.tsx
│       │   │   └── symbol-preview.tsx
│       │   └── ui/
│       │       ├── accordion.tsx
│       │       ├── alert-dialog.tsx
│       │       ├── alert.tsx
│       │       ├── aspect-ratio.tsx
│       │       ├── avatar.tsx
│       │       ├── badge.tsx
│       │       ├── breadcrumb.tsx
│       │       ├── button.tsx
│       │       ├── calendar.tsx
│       │       ├── card.tsx
│       │       ├── carousel.tsx
│       │       ├── chart.tsx
│       │       ├── checkbox.tsx
│       │       ├── collapsible.tsx
│       │       ├── command.tsx
│       │       ├── context-menu.tsx
│       │       ├── dialog.tsx
│       │       ├── drawer.tsx
│       │       ├── dropdown-menu.tsx
│       │       ├── form.tsx
│       │       ├── hover-card.tsx
│       │       ├── input-otp.tsx
│       │       ├── input.tsx
│       │       ├── label.tsx
│       │       ├── menubar.tsx
│       │       ├── navigation-menu.tsx
│       │       ├── pagination.tsx
│       │       ├── popover.tsx
│       │       ├── progress.tsx
│       │       ├── radio-group.tsx
│       │       ├── resizable.tsx
│       │       ├── scroll-area.tsx
│       │       ├── select.tsx
│       │       ├── separator.tsx
│       │       ├── sheet.tsx
│       │       ├── sidebar.tsx
│       │       ├── skeleton.tsx
│       │       ├── slider.tsx
│       │       ├── switch.tsx
│       │       ├── table.tsx
│       │       ├── tabs.tsx
│       │       ├── textarea.tsx
│       │       ├── theme-provider.tsx
│       │       ├── toast.tsx
│       │       ├── toaster.tsx
│       │       ├── toggle-group.tsx
│       │       ├── toggle.tsx
│       │       ├── tooltip.tsx
│       │       └── use-toast.ts
│       ├── hooks/
│       │   ├── use-auth.tsx
│       │   ├── use-mobile.tsx
│       │   └── use-toast.ts
│       ├── index.css
│       ├── lib/
│       │   ├── api-client.ts
│       │   ├── protected-route.tsx
│       │   ├── queryClient.ts
│       │   ├── utils/
│       │   │   └── formatters.ts
│       │   └── utils.ts
│       ├── main.tsx
│       └── pages/
│           ├── api-keys-page.tsx
│           ├── auth-page.tsx
│           ├── dashboard-page.tsx
│           ├── history-page.tsx
│           ├── home-page.tsx
│           ├── market-page.tsx
│           ├── not-found.tsx
│           ├── performance-page.tsx
│           ├── profile-page.tsx
│           ├── reports-page.tsx
│           ├── settings-page.tsx
│           ├── simulation-page.tsx
│           ├── simulator-page.tsx
│           ├── strategies-page.tsx
│           ├── trading-page.tsx
│           └── Trading.jsx
├── dist/
│   ├── index.js
│   └── public/
│       ├── assets/
│       │   ├── index-B1Tb2egm.js
│       │   └── index-DS5X8VWd.css
│       └── index.html
├── drizzle.config.ts
├── generated-icon.png
├── java-backend/
│   ├── .gitattributes
│   ├── .gitignore
│   ├── .mvn/
│   │   └── wrapper/
│   │       └── maven-wrapper.properties
│   ├── mvnw
│   ├── mvnw.cmd
│   ├── pom.xml
│   └── src/
│       ├── main/
│       │   ├── java/
│       │   │   ├── com/
│       │   │   │   └── trading/
│       │   │   │       └── app/
│       │   │   │           ├── AlgorithmicTradingApplication.java
│       │   │   │           ├── config/
│       │   │   │           │   └── WebConfig.java
│       │   │   │           ├── controller/
│       │   │   │           │   ├── MarketDataController.java
│       │   │   │           │   ├── SimulationController.java
│       │   │   │           │   ├── StrategyController.java
│       │   │   │           │   └── SymbolController.java
│       │   │   │           ├── model/
│       │   │   │           │   ├── MarketData.java
│       │   │   │           │   ├── Simulation.java
│       │   │   │           │   ├── Strategy.java
│       │   │   │           │   ├── Symbol.java
│       │   │   │           │   ├── Trade.java
│       │   │   │           │   └── User.java
│       │   │   │           ├── repository/
│       │   │   │           │   ├── MarketDataRepository.java
│       │   │   │           │   ├── SimulationRepository.java
│       │   │   │           │   ├── StrategyRepository.java
│       │   │   │           │   ├── SymbolRepository.java
│       │   │   │           │   ├── TradeRepository.java
│       │   │   │           │   └── UserRepository.java
│       │   │   │           └── service/
│       │   │   │               ├── AlphaVantageService.java
│       │   │   │               ├── MarketDataService.java
│       │   │   │               ├── SimulationService.java
│       │   │   │               ├── StrategyService.java
│       │   │   │               ├── SymbolService.java
│       │   │   │               └── YahooFinanceService.java
│       │   │   └── org/
│       │   │       └── zenith/
│       │   │           └── pay/
│       │   │               └── demo/
│       │   │                   ├── config/
│       │   │                   │   └── WebSecurityConfig.java
│       │   │                   ├── controller/
│       │   │                   │   └── AuthController.java
│       │   │                   ├── DemoApplication.java
│       │   │                   ├── dto/
│       │   │                   │   ├── AuthResponse.java
│       │   │                   │   └── UserDTO.java
│       │   │                   ├── model/
│       │   │                   │   └── User.java
│       │   │                   ├── repository/
│       │   │                   │   └── UserRepository.java
│       │   │                   └── service/
│       │   │                       └── UserService.java
│       │   └── resources/
│       │       └── application.properties
│       └── test/
│           └── java/
│               └── org/
│                   └── zenith/
│                       └── pay/
│                           └── demo/
│                               └── ZenithApplicationTests.java
├── package-lock.json
├── package.json
├── postcss.config.js
├── serve-frontend.js
├── server/
│   ├── api/
│   │   ├── market.ts
│   │   ├── simulation.ts
│   │   └── trades.ts
│   ├── auth.ts
│   ├── index.ts
│   ├── routes.ts
│   ├── services/
│   │   ├── alpha-vantage.ts
│   │   └── yahoo-finance.ts
│   ├── storage.ts
│   ├── utils/
│   │   └── trade.ts
│   └── vite.ts
├── shared/
│   └── schema.ts
├── tailwind.config.ts
├── theme.json
├── tsconfig.json
└── vite.config.ts

```

## Installation

### Prerequisites

- Node.js (v14 or higher)
- Python (v3.8 or higher)
- Java Development Kit (JDK 11 or higher)
- npm or yarn

### Setup Instructions

1. Clone the repository
   ```bash
   git clone https://github.com/advay-sinha/Algo-Trade-Simulator.git
   cd Algo-Trade-Simulator
   ```

2. Install frontend dependencies
   ```bash
   npm install
   ```

3. Start the Python backend
   ```bash
   cd app
   python main.py
   ```

4. Start the Node.js server and React frontend
   ```bash
   # From the root directory
   npm run dev
   ```

5. The application should now be running at `http://localhost:5000`

## Usage

1. Register for a new account or login with existing credentials
2. Browse available stocks and market data
3. Compare different stocks using the comparison tool
4. Use the chatbot for strategy recommendations
5. Place virtual trades and monitor your portfolio performance

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Market data provided by Yahoo Finance
- Trading algorithms inspired by Investopedia
- Built with dedication by [advay-sinha](https://github.com/advay-sinha)
