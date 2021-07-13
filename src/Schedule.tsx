import React, { useState, useRef, useEffect } from 'react';
import Paper from '@material-ui/core/Paper';
import AppBar from '@material-ui/core/AppBar';
import CssBaseline from '@material-ui/core/CssBaseline';
import Divider from '@material-ui/core/Divider';
import Drawer from '@material-ui/core/Drawer';
import Hidden from '@material-ui/core/Hidden';
import IconButton from '@material-ui/core/IconButton';
import InboxIcon from '@material-ui/icons/MoveToInbox';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';
import MailIcon from '@material-ui/icons/Mail';
import MenuIcon from '@material-ui/icons/Menu';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import { makeStyles, useTheme, Theme, createStyles } from '@material-ui/core/styles';
import { BrowserRouter, Route, Switch, Redirect, Link } from "react-router-dom";
import Box from '@material-ui/core/Box';
import { sizing, palette, positions } from '@material-ui/system';
import { seq } from './Utils';
import Draggable from 'react-draggable'; // The default

const drawerWidth = 240;

const useStyles = makeStyles((theme: Theme) =>
    createStyles({
        rowOverlayHover: {
            width: '0',
            padding: '0 !important',
        },
        overlayWrapper: {
            position: 'relative',
        },
        overlayContent: {
            visibility: 'hidden',
            position: 'absolute',
            right: '0',
        },
    }),
);

// .row-overlay-hover:hover .overlay-content {
//     visibility: visible;
// }

interface Props {
    /**
     * Injected by the documentation to work in an iframe.
     * You won't need it on your project.
     */
    window?: () => Window;
}
type Shift = {
    startDate: Date;
    endDate: Date;
    id: number
}

const appointments = [
    {
        startDate: new Date(2021, 7, 13, 9, 35),
        endDate: new Date(2021, 7, 14, 11, 30),
        id: 0,
    }
];

const addDay = (d: Date, days: number) => {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

const toDate = (d: Date) => {
    let t = new Date(d);
    t.setHours(0);
    t.setMinutes(0);
    t.setSeconds(0);
    t.setMilliseconds(0);
    return t;
}

const col = 100;

export default function Schedule(props: Props) {
    const [data, setData] = useState<Shift[]>(appointments);
    const [currentDate, setDate] = useState(new Date());
    const startDate = toDate(addDay(currentDate, -currentDate.getDay()));
    const classes = useStyles();

    const MakeBox = () => {
        const [x, setX] = useState(0);
        const [y, setY] = useState(0);
        const isDrg = useRef(false);
        const isFirst = useRef(true);
        const gx = useRef(0);
        const gy = useRef(0);
        const ox = useRef(0);
        const oy = useRef(0);
        const sx = useRef(0);
        const sy = useRef(0);
        const onMove = (e: any) => {
            if (!isDrg.current) return;
            // Ad hoc !!
            let bd = e.target.ownerDocument.scrollingElement;
            let h = sy.current - bd.scrollTop;
            let w = sx.current - bd.scrollLeft;
            setX(e.clientX - w - gx.current - ox.current);
            setY(e.clientY - h - gy.current - oy.current);
        }
        const onUp = (e: any) => {
            ox.current = 0;
            oy.current = 0;
            isDrg.current = false;
            let el = e.target.ownerDocument;
            el.removeEventListener('mousemove', onMove, { capture: true });
            el.removeEventListener('mouseup', onUp, { capture: true });
        }
        const onDown = (e: any) => {
            if (isFirst.current) {
                let bd = e.target.ownerDocument.scrollingElement;
                let { left, top } = e.target.getBoundingClientRect()
                gx.current = left;
                gy.current = top;
                sy.current = bd.scrollTop;
                sx.current = bd.scrollLeft;
                isFirst.current = false;
            }
            ox.current = e.nativeEvent.offsetX;
            oy.current = e.nativeEvent.offsetY;
            isDrg.current = true;
            let el = e.target.ownerDocument;
            el.addEventListener('mouseup', onUp, { capture: true });
            el.addEventListener('mousemove', onMove, { capture: true });
        }
        return (
            <Box onMouseUp={onUp} onMouseDown={onDown} width={col} height={50} style={{ transform: `translate(${x}px,${y}px)` }} sx={{ bgcolor: "red", }} />
        );
    };

    return (
        <Paper>
            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell width={col}>Dessert</TableCell>
                        <TableCell width={col}>Calories</TableCell>
                        <TableCell width={col}>Fat&nbsp;(g)</TableCell>
                        <TableCell width={col}>Carbs&nbsp;(g)</TableCell>
                        <TableCell width={col}>Protein&nbsp;(g)</TableCell>
                        <TableCell width={col}>Carbs&nbsp;(g)</TableCell>
                        <TableCell width={col}>Protein&nbsp;(g)</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {seq(48).map((i) => {
                        return (
                            <TableRow >
                                <TableCell width={col} />
                                <TableCell width={col} />
                                <TableCell width={col} />
                                <TableCell width={col} />
                                <TableCell width={col} />
                                <TableCell width={col} />
                                <TableCell width={col} />
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
            <div>
                <MakeBox />
                <Draggable>
                    <div>I can now be moved around!</div>
                </Draggable>
            </div>
        </Paper >
    );
}
