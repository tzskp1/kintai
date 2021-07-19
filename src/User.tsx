import React, { useRef, useEffect, useCallback } from 'react';
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
import { getUsers, getToken, User, postUser } from './Utils'
import { useHistory } from 'react-router-dom';
import Alert from '@material-ui/lab/Alert';
import Paper from '@material-ui/core/Paper';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';
import ScheduleIcon from '@material-ui/icons/Schedule';
import Toolbar from '@material-ui/core/Toolbar';
import IconButton from '@material-ui/core/IconButton';
import AddIcon from '@material-ui/icons/Add';
import Popover from '@material-ui/core/Popover';

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

export default function UserList() {
    const history = useHistory();
    const classes = useStyles();
    const pref = useRef();
    const [anchorEl, setAnchorEl] = useState<HTMLElement | undefined>(undefined);
    const [newUser, setNuser] = useState("");
    const [users, setUsers] = useState<User[]>([]);
    const [checked, setChecked] = React.useState(false);
    useEffect(() => {
        if (!getToken()) {
            history.push('/login');
        }
        (async () => {
            const us = await getUsers();
            if (us) setUsers(us);
        })();
    }, [history]);

    const open = Boolean(anchorEl);
    const id = open ? `users-popover` : undefined;
    const popoverClose = useCallback(() => setAnchorEl(undefined), []);

    return (
        <>
            <Toolbar>
                <IconButton color="inherit" onClick={() => history.push('/schedules')}>
                    <ScheduleIcon />
                </IconButton>
                <IconButton color="inherit" onClick={(e) => setAnchorEl(pref.current)}>
                    <AddIcon />
                </IconButton>
            </Toolbar>
            <Paper ref={pref}>
                <List>
                    {users.map((u) => <ListItem button ><ListItemText primary={u.id} /></ListItem>)}
                </List>
            </Paper>
            <Popover
                id={id}
                open={open}
                anchorEl={anchorEl}
                onClose={popoverClose}
                anchorOrigin={{
                    vertical: 'top',
                    horizontal: 'center',
                }}
                transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                }}
            >
                <form onSubmit={(e) => e.preventDefault()} noValidate>
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
                        onChange={(e) => setNuser(e.target.value)}
                    />
                    <FormControlLabel
                        control={<Checkbox
                            checked={checked}
                            onChange={(e) => setChecked(e.target.checked)}
                            inputProps={{ 'aria-label': 'primary checkbox' }} />}
                        label="管理者権限を与える"
                        labelPlacement="start"
                    />
                    <Button
                        type="submit"
                        fullWidth
                        variant="contained"
                        color="primary"
                        onClick={async () => {
                            const ret = await postUser(newUser, checked);
                            if (ret) {
                                let ns = [...users];
                                ns.push({ id: ret.id, isadmin: ret.isadmin });
                                setUsers(ns);
                                alert(`パスワードは${ret.pass}です`);
                                popoverClose();
                            } else {
                                alert("エラー");
                            }
                        }}
                    >作成</Button>
                </form>
            </Popover>
        </>
    );
}
