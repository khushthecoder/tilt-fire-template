import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Image,
  Animated,
  TouchableOpacity,
  Vibration,
  Platform,
} from 'react-native';
import { Accelerometer } from 'expo-sensors';

const { width: W, height: H } = Dimensions.get('window');

const PATH_PADDING = 0.08 * W;
const PATH_WIDTH = W - PATH_PADDING * 2;
const PLAYER_W = Math.min(64, PATH_WIDTH * 0.18);
const PLAYER_H = PLAYER_W * 1.1;

const PLAYER_Y_FIXED = H * 0.8;
const TRACK_WIDTH = PATH_WIDTH - PLAYER_W;

const OB_MIN_W = PLAYER_W * 0.7;
const OB_MAX_W = PLAYER_W * 1.4;

const bikeImg = require('./assets/bike.png');
const carImages = [
  require('./assets/car1.png'),
  require('./assets/car2.png'),
  require('./assets/car3.png'),
  require('./assets/car4.png'),
];

function randomCarImage() {
  return carImages[Math.floor(Math.random() * carImages.length)];
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function rectIntersect(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

function Bike({ x, width, height }) {
  return (
    <Animated.Image
      source={bikeImg}
      style={[
        bikeStyles.bike,
        {
          transform: [{ translateX: x }],
          width,
          height
        }
      ]}
      resizeMode="contain"
    />
  );
}

const bikeStyles = StyleSheet.create({
  bike: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    left: PATH_PADDING,
    top: PLAYER_Y_FIXED,
  },
});

function Obstacle({ width, height, source }) {
  return (
    <Image
      source={source}
      style={[
        obstacleStyles.obstacle,
        {
          width,
          height,
          backgroundColor: 'transparent',
        }
      ]}
      resizeMode="contain"
    />
  );
}

const obstacleStyles = StyleSheet.create({
  obstacle: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 90,
  },
});

function Road({ running }) {
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let anim;
    function start() {
      y.setValue(0);
      anim = Animated.loop(
        Animated.timing(y, { toValue: 1, duration: 1400, useNativeDriver: true })
      );
      anim.start();
    }

    if (running) start();
    return () => anim && anim.stop();
  }, [running, y]);

  const translateY = y.interpolate({ inputRange: [0, 1], outputRange: [0, 40] });

  return (
    <View style={roadStyles.container} pointerEvents="none">
      <Animated.View style={[roadStyles.stripes, { transform: [{ translateY }] }]} />
      <Animated.View style={[roadStyles.stripes, { transform: [{ translateY }], top: -40 }]} />
    </View>
  );
}

const roadStyles = StyleSheet.create({
  container: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 1 },
  stripes: { position: 'absolute', left: 0, right: 0, top: 0, height: '100%', backgroundColor: 'transparent', borderLeftWidth: 0 },
});

export default function BikeGame() {

  const playerX = useRef(new Animated.Value(TRACK_WIDTH / 2)).current;

  const [running, setRunning] = useState(true);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);

  const obstaclesRef = useRef([]);
  const [obstacles, setObstacles] = useState([]);

  const rafRef = useRef(null);
  const lastRef = useRef(Date.now());

  useEffect(() => {
    Accelerometer.setUpdateInterval(16);
    const sensitivity = 150;

    const subscription = Accelerometer.addListener(({ x = 0 }) => {
      if (!running || gameOver) return;

      const tilt = x;
      const current = playerX.__getValue();

      const target = clamp(current + -tilt * sensitivity, 0, TRACK_WIDTH);

      Animated.spring(playerX, {
        toValue: target,
        useNativeDriver: true,
        speed: 120,
        bounciness: 0
      }).start();
    });
    return () => subscription && subscription.remove();
  }, [running, gameOver, playerX]);

  useEffect(() => {
    const spawn = () => {
      const w = OB_MIN_W + Math.random() * (OB_MAX_W - OB_MIN_W);
      const laneX = PATH_PADDING + Math.random() * (PATH_WIDTH - w);

      const ob = {
        id: String(Math.random().toString(36).slice(2)),
        x: laneX,
        y: -80,
        w,
        h: 26 + Math.random() * 20,
        speed: 120 + Math.random() * 60,
        source: randomCarImage()
      };

      obstaclesRef.current.push(ob);
      setObstacles([...obstaclesRef.current]);
    };
    const id = setInterval(() => { if (running && !gameOver) spawn(); }, 900);
    return () => clearInterval(id);
  }, [running, gameOver]);

  useEffect(() => {
    const t = setInterval(() => { if (running && !gameOver) { scoreRef.current += 1; setScore(scoreRef.current); } }, 250);
    return () => clearInterval(t);
  }, [running, gameOver]);

  useEffect(() => {
    lastRef.current = Date.now();
    function loop() {
      if (!running || gameOver) return;
      const now = Date.now();
      const dt = (now - lastRef.current) / 1000;
      lastRef.current = now;

      const next = [];
      for (let ob of obstaclesRef.current) {
        const ny = ob.y + ob.speed * dt;
        if (ny < H + 120) {
          next.push({ ...ob, y: ny });
        }
      }
      obstaclesRef.current = next;
      setObstacles([...next]);

      const pxOffset = playerX.__getValue();
      const px = PATH_PADDING + pxOffset;

      const pRect = { x: px, y: PLAYER_Y_FIXED, w: PLAYER_W, h: PLAYER_H };

      for (let ob of next) {
        if (rectIntersect(pRect, { x: ob.x, y: ob.y, w: ob.w, h: ob.h })) {
          Vibration.vibrate && Vibration.vibrate(250);
          setGameOver(true);
          setRunning(false);
          cancelAnimationFrame(rafRef.current);
          return;
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, gameOver, playerX]);

  function restart() {
    obstaclesRef.current = [];
    setObstacles([]);
    scoreRef.current = 0;
    setScore(0);
    setGameOver(false);
    setRunning(true);
    lastRef.current = Date.now();
    playerX.setValue(TRACK_WIDTH / 2);
  }

  return (
    <View style={styles.container}>
      <Road running={running && !gameOver} />

      <View style={styles.topBar} pointerEvents="none">
        <Text style={styles.score}>{score}</Text>
      </View>

      {obstacles.map((o) => (
        <View key={o.id} style={[styles.obWrapper, { left: o.x, top: o.y, width: o.w, height: o.h }]}>
          <Obstacle width={o.w} height={o.h} source={o.source} />
        </View>
      ))}

      <Bike x={playerX} width={PLAYER_W} height={PLAYER_H} />

      <View style={styles.controls} pointerEvents="box-none">
        <TouchableOpacity style={styles.restart} onPress={restart}><Text style={styles.restartText}>Restart</Text></TouchableOpacity>
      </View>

      {gameOver && (
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>GAME OVER</Text>
          <Text style={styles.overlayScore}>Score: {score}</Text>
          <TouchableOpacity onPress={restart} style={styles.playAgain}><Text style={styles.playAgainText}>Play Again</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#073b4c' },
  topBar: { position: 'absolute', top: Platform.OS === 'ios' ? 48 : 18, left: 0, right: 0, alignItems: 'center', zIndex: 300 },
  score: { color: '#fff', fontSize: 26, fontWeight: '900' },
  obWrapper: { position: 'absolute', zIndex: 90 },
  controls: { position: 'absolute', left: 0, right: 0, bottom: 26, alignItems: 'center', zIndex: 300 },
  restart: { backgroundColor: '#ffd166', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 },
  restartText: { fontWeight: '800', color: '#042a2b' },
  overlay: { position: 'absolute', left: 30, right: 30, top: H * 0.28, backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: 12, padding: 20, alignItems: 'center', zIndex: 999 },
  overlayText: { color: '#ff6b6b', fontSize: 36, fontWeight: '900' },
  overlayScore: { color: '#fff', fontSize: 20, marginTop: 10, marginBottom: 10 },
  playAgain: { backgroundColor: '#06d6a0', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 },
  playAgainText: { color: '#012a4a', fontWeight: '900' },
});
