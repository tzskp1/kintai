import React from 'react';
import ReactDOM from 'react-dom';
import Schedule from './Schedule';
import Login from './Login';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter, Route, Switch, Redirect } from "react-router-dom";
import { createTheme } from "@material-ui/core/styles";
import { ThemeProvider } from "@material-ui/styles";
import * as colors from "@material-ui/core/colors";
import "typeface-roboto";
import "fontsource-noto-sans-jp";
import "fontsource-noto-sans-jp/500.css";

const theme = createTheme({
    typography: {
        fontFamily: [
            "Noto Sans JP",
            "Lato",
            "游ゴシック Medium",
            "游ゴシック体",
            "Yu Gothic Medium",
            "YuGothic",
            "ヒラギノ角ゴ ProN",
            "Hiragino Kaku Gothic ProN",
            "メイリオ",
            "Meiryo",
            "ＭＳ Ｐゴシック",
            "MS PGothic",
            "sans-serif",
        ].join(","),
    },
    palette: {
        primary: { main: colors.blue[800] },
    },
});

ReactDOM.render(
    <ThemeProvider theme={theme}>
        <BrowserRouter>
            <Switch>
                <Route path="/schedules" component={Schedule} />
                <Route path="/users" component={Schedule} />
                <Route path="/admin" component={Schedule} />
                <Route path="/login" component={Login} />
                <Redirect from="/" to="/login" />
            </Switch>
        </BrowserRouter>
    </ThemeProvider>,
    document.getElementById('root')
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
