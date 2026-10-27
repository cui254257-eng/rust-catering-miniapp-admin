import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App as AntdApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#c21850',
          colorLink: '#c21850',
          colorLinkHover: '#d6336c',
          colorLinkActive: '#9b123f',
          borderRadius: 10,
        },
        components: {
          Menu: {
            darkItemSelectedBg: '#c21850',
            darkItemHoverBg: 'rgb(255 255 255 / 10%)',
          },
        },
      }}
    >
      <AntdApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>,
)
