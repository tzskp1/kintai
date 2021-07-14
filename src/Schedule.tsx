import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
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
import { useResizeDetector } from 'react-resize-detector';

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

const DragBox = ({ procXY = (x) => x, onDown = (x) => { return new Promise(() => { return; }); }, width = 100, height = 50, initX = 300, initY = 100 }: { procXY?: (_: [number, number]) => [number, number], onDown?: (_: [number, number]) => Promise<void>, width?: number, height?: number, initX?: number, initY?: number }) => {
    const [x, setX] = useState(initX);
    const [y, setY] = useState(initY);
    const isDrg = useRef(false);
    const ox = useRef(0);
    const oy = useRef(0);
    useEffect(() => {
        setX(initX);
        setY(initY);
    }, [initX, initY]);
    const onMove = useCallback((e: any) => {
        if (!isDrg.current) return;
        // Ad hoc !!
        let bd = e.target.ownerDocument.scrollingElement;
        const [px, py] = procXY([e.clientX + bd.scrollLeft - ox.current, e.clientY + bd.scrollTop - oy.current]);
        setX(px);
        setY(py);
    }, [procXY, setX, setY]);
    const onUp = useCallback((e: any) => {
        ox.current = 0;
        oy.current = 0;
        isDrg.current = false;
        let el = e.target.ownerDocument;
        el.removeEventListener('mousemove', onMove, { capture: true });
        el.removeEventListener('mouseup', onUp, { capture: true });
    }, [onMove]);
    const _onDown = useCallback(async (e: any) => {
        ox.current = e.nativeEvent.offsetX;
        oy.current = e.nativeEvent.offsetY;
        isDrg.current = true;
        let el = e.target.ownerDocument;
        el.addEventListener('mouseup', onUp, { capture: true });
        el.addEventListener('mousemove', onMove, { capture: true });
        await onDown([x, y]);
    }, [onDown, onUp, onMove, x, y]);
    return (
        <Box onMouseUp={onUp} onMouseDown={_onDown} width={width} height={height} sx={{ bgcolor: "red", position: 'absolute', left: x, top: y, }} />
    );
}

const col = 100;

export default function Schedule(props: Props) {
    const [data, setData] = useState<Shift[]>(appointments);
    const [currentDate, setDate] = useState(new Date());
    const startDate = toDate(addDay(currentDate, -currentDate.getDay()));
    const classes = useStyles();
    const cells = useRef<any[][]>(seq(48).map((_) => seq(7).map((_) => undefined)));
    const anchors = useRef<number[][][]>(seq(48).map((_) => seq(7).map((_) => [-1, -1])));
    const [cw, setCw] = useState(100); // column width
    const [rh, setRh] = useState(50); // row height
    const [x, setX] = useState(0);
    const [y, setY] = useState(0);
    const onResize = useCallback(() => {
        cells.current.forEach((v, i, _) =>
            v.forEach((r, j, _) => {
                if (r) {
                    let bd = r.ownerDocument.scrollingElement;
                    let { left, top } = r.getBoundingClientRect()
                    if (bd) {
                        anchors.current[i][j] = [left + bd.scrollLeft, top + bd.scrollTop];
                    }
                }
            }));
        let rect = cells.current[0][0].getBoundingClientRect();
        setX(anchors.current[0][1][0]);
        setY(anchors.current[0][1][1]);
        setCw(rect.width);
        setRh(rect.height);
    }, [setCw, setRh, setX, setY]);
    const { ref } = useResizeDetector({ onResize });
    useEffect(onResize, []);

    return (
        <>
            <Paper ref={ref}>
                <Table >
                    <TableHead>
                        <TableRow>
                            <TableCell style={{ borderLeft: '1px solid' }} width={cw}>Dessert</TableCell>
                            <TableCell style={{ borderLeft: '1px solid' }} width={cw}>Calories</TableCell>
                            <TableCell style={{ borderLeft: '1px solid' }} width={cw}>Fat&nbsp;(g)</TableCell>
                            <TableCell style={{ borderLeft: '1px solid' }} width={cw}>Carbs&nbsp;(g)</TableCell>
                            <TableCell style={{ borderLeft: '1px solid' }} width={cw}>Protein&nbsp;(g)</TableCell>
                            <TableCell style={{ borderLeft: '1px solid' }} width={cw}>Carbs&nbsp;(g)</TableCell>
                            <TableCell style={{ borderLeft: '1px solid' }} width={cw}>Protein&nbsp;(g)</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {seq(48).map((i) => {
                            return (
                                <TableRow >
                                    <TableCell ref={(r) => { cells.current[i][0] = r }} style={{ borderLeft: '1px solid' }} width={cw} />
                                    <TableCell ref={(r) => { cells.current[i][1] = r }} style={{ borderLeft: '1px solid' }} width={cw} />
                                    <TableCell ref={(r) => { cells.current[i][2] = r }} style={{ borderLeft: '1px solid' }} width={cw} />
                                    <TableCell ref={(r) => { cells.current[i][3] = r }} style={{ borderLeft: '1px solid' }} width={cw} />
                                    <TableCell ref={(r) => { cells.current[i][4] = r }} style={{ borderLeft: '1px solid' }} width={cw} />
                                    <TableCell ref={(r) => { cells.current[i][5] = r }} style={{ borderLeft: '1px solid' }} width={cw} />
                                    <TableCell ref={(r) => { cells.current[i][6] = r }} style={{ borderLeft: '1px solid' }} width={cw} />
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </Paper >
            <div>
                <DragBox width={cw} initX={x} initY={y} />
                <DragBox width={cw} />
                <DragBox width={cw} />
            </div>
        </>
    );
}
