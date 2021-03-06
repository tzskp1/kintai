import React, { useEffect } from 'react';
import { useState } from 'react';
import Avatar from '@material-ui/core/Avatar';
import Button from '@material-ui/core/Button';
import CssBaseline from '@material-ui/core/CssBaseline';
import TextField from '@material-ui/core/TextField';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Checkbox from '@material-ui/core/Checkbox';
import Link from '@material-ui/core/Link';
import Grid from '@material-ui/core/Grid';
import Box from '@material-ui/core/Box';
import LockOutlinedIcon from '@material-ui/icons/LockOutlined';
import Typography from '@material-ui/core/Typography';
import { makeStyles } from '@material-ui/core/styles';
import Container from '@material-ui/core/Container';
import { login, getToken } from './Utils'
import { useHistory } from 'react-router-dom';
import Alert from '@material-ui/lab/Alert';

const useStyles = makeStyles((theme) => ({
    paper: {
        marginTop: theme.spacing(8),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
    },
    avatar: {
        margin: theme.spacing(1),
        backgroundColor: theme.palette.secondary.main,
    },
    form: {
        width: '100%', // Fix IE 11 issue.
        marginTop: theme.spacing(1),
    },
    submit: {
        margin: theme.spacing(3, 0, 2),
    },
}));

export default function SignIn() {
    const history = useHistory();
    const classes = useStyles();
    const [email, setEmail] = useState('');
    const [error, setError] = useState(false);
    const [pass, setPass] = useState('');
    useEffect(() => {
        if (getToken()) {
            history.push('/schedules');
        }
    }, [history]);

    return (
        <Container component="main" maxWidth="xs">
            <CssBaseline />
            <div className={classes.paper}>
                <Avatar className={classes.avatar}>
                    <LockOutlinedIcon />
                </Avatar>
                <Typography component="h1" variant="h5">
                    ログイン
                </Typography>
                <form className={classes.form} onSubmit={(e) => e.preventDefault()} noValidate>
                    <TextField
                        variant="outlined"
                        margin="normal"
                        required
                        fullWidth
                        id="email"
                        label="メールアドレスまたはID"
                        name="email"
                        autoComplete="email"
                        autoFocus
                        onChange={(e) => setEmail(e.target.value)}
                    />
                    <TextField
                        variant="outlined"
                        margin="normal"
                        required
                        fullWidth
                        label="パスワード"
                        name="password"
                        type="password"
                        id="password"
                        autoComplete="current-password"
                        onChange={(e) => setPass(e.target.value)}
                    />
                    <Alert severity="info">ID: root password: pass</Alert>
                    {error ? <Alert severity="error">ユーザー名かパスワードが異なります</Alert> : undefined}
                    <Button
                        type="submit"
                        fullWidth
                        variant="contained"
                        color="primary"
                        className={classes.submit}
                        onClick={async () => {
                            const t = await login(email, pass);
                            if (t) {
                                localStorage.setItem('token', t);
                                history.push('/schedules');
                            } else {
                                setError(true);
                            }
                        }}
                    >
                        ログイン
                    </Button>
                </form>
            </div>
        </Container>
    );
}
