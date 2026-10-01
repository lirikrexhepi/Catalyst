import React from 'react'
import {createRoot} from 'react-dom/client'
import './index.css'
import { initFonts } from './fonts'

import App from './App'

void initFonts()

const container = document.getElementById('root')

const root = createRoot(container!)

root.render(
    <React.StrictMode>
        <App/>
    </React.StrictMode>
)
