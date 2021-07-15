import React from 'react';
import ReactDOM from 'react-dom';
import Schedule from './Schedule';
import Login from './Login';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter, Route, Switch, Redirect } from "react-router-dom";

ReactDOM.render(
    <BrowserRouter>
        <Switch>
            <Route path="/employee" component={Schedule} />
            <Route path="/login" component={Login} />
            <Redirect from="/" to="/login" />
        </Switch>
    </BrowserRouter>,
    document.getElementById('root')
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
