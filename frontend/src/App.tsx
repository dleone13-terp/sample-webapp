import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import CustomersPage from './pages/CustomersPage';
import BillsPage from './pages/BillsPage';
import BillDetailPage from './pages/BillDetailPage';

function App() {
  return (
    <BrowserRouter>
      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-logo">
            <h1>🚛 FreightTrack</h1>
            <p>Bill Lifecycle Manager</p>
          </div>
          <nav className="sidebar-nav">
            <NavLink to="/" end>
              <span>📊</span> <span>Dashboard</span>
            </NavLink>
            <NavLink to="/bills">
              <span>📋</span> <span>Bills</span>
            </NavLink>
            <NavLink to="/customers">
              <span>👥</span> <span>Customers</span>
            </NavLink>
          </nav>
        </aside>
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/bills" element={<BillsPage />} />
            <Route path="/bills/:id" element={<BillDetailPage />} />
            <Route path="/customers" element={<CustomersPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
