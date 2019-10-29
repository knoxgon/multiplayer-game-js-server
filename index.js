const express = require('express');
const http = require('http');
const unixWebSocket = require('socket.io');
const app = express();
const server = http.Server(app);
const PORT = 1234;
const io = unixWebSocket(server);
const fs = require('fs');
let rawdata = fs.readFileSync('gamelayer.json');
let gamejson = JSON.parse(rawdata);

//data[0,0,12,62,4,0,959] name="xtilelayer"
let layerInfo = [];
let map2d = [];

gamejson.layers.forEach((e,i) => {
  layerInfo[e.name] = [];
  layerInfo[e.name].push({data: e.data});
});

let i = 0;
for(let y = 0; y < layerInfo['wall'][0].data.length / 16; y++) {
  map2d[y] = [];
  for(let x = 0; x < layerInfo['wall'][0].data.length / 16; x++) {
    if(layerInfo['wall'][0].data[i] > 0)
      map2d[y].push(1);
    else
      map2d[y].push(layerInfo['wall'][0].data[i]);
    i++;
  }
}

let strrep = '';

for(let i = 0; i < 16; i++) {
  for(let j = 0; j < 16; j++) {
    strrep += map2d[i][j] + ' ';
  }
  strrep += '\n';
}
console.log(strrep);

app.set('port', PORT);
server.listen(PORT, () => console.log(`Game server started at port ${PORT}`));

const WIDTH = 512;
const HEIGHT = 512;

const onlinePlayers = {};
const playerSockets = {};

function broadcastToAll(event, message) {
  if (!playerSockets) return;
  for (let key in playerSockets) {
    playerSockets[key].emit(event, message);
  }
}

function inFieldExp(data, currentFace) {
  if (!data) return;
  let tileCoord = 0;

    if(currentFace == 2) { //right
      tileCoord =  map2d[Math.floor((((data.y) + 1)) / 32)][Math.floor(((data.x + 32) + 1) / 32)];
      if(tileCoord > 0){
        data.x = data.x - 1;
      }
    }
    if(currentFace == 1) { //left
      tileCoord =  map2d[Math.floor((((data.y) + 1)) / 32)][Math.floor(((data.x - 4) + 1) / 32)];
      if(tileCoord > 0){
        data.x = data.x + 1;
      }
    }
    if(currentFace == 0) { //down
      tileCoord =  map2d[Math.floor((((data.y + 32) + 1)) / 32)][Math.floor(((data.x) + 1) / 32)];
      if(tileCoord > 0){
        data.y = data.y - 1;
      }
    }
    if(currentFace == 3) { //up
      tileCoord =  map2d[Math.floor((((data.y - 4) + 1)) / 32)][Math.floor(((data.x) + 1) / 32)];
      if(tileCoord > 0){
        data.y = data.y + 1;
      }
    }
}

function inField(data) {
  if (!data) return;
  if ((data.x - data.radius - data.speed) < 0) {
    data.x = data.radius + 1;
  }
  else if ((data.x + data.radius + data.speed) > WIDTH) {
    data.x = WIDTH - data.radius - 1;
  }
  if ((data.y - data.radius - data.speed) < 0) {
    data.y = data.radius + 1;
  }
  else if ((data.y + data.radius + data.speed) > HEIGHT) {
    data.y = HEIGHT - data.radius - 1;
  }
}

function circleToCircleCollision(srcX, srcY, srcRadius, trgX, trgY, trgRadius) {
  if((srcRadius + trgRadius) > Math.sqrt(((srcX - trgX) * (srcX - trgX)) + ((srcY - trgY) * (srcY - trgY)))) {
    return true;
  }
  return false; 
}

function rectToRectCollision(srcX, srcY, srcW, srcH, trgX, trgY, trgW, trgH) {
  if(srcX < trgX + trgW && srcX + srcW > trgX && srcY < trgY + trgH && srcY + srcH > trgY) {
    return true;
  }
  return false;
}

function checkCircleToCircleCollision(src, trg) {
  for(const key in trg) {
    if(circleToCircleCollision(src.x, src.y, src.radius, trg[key].x, trg[key].y, trg[key].radius) && src.name !== trg[key].name){
      const distX = src.x - trg[key].x;
      const distY = src.y - trg[key].y;
      const totRadius  = src.radius + trg[key].radius;
      const pythagoram_C_Side = Math.sqrt((distX*distX)+(distY*distY));
      const unitX = distX / pythagoram_C_Side;
      const unitY = distY / pythagoram_C_Side;
      src.x = trg[key].x + (totRadius + 1) * unitX;
      src.y = trg[key].y + (totRadius + 1) * unitY;
    }
  }
}

io.on('connection', (socket) => {
  if (!socket) return;
  socket.on('new player spawn', (data) => {
    if (!data) return;
    onlinePlayers[socket.id] = {
      name: data.name,
      x: data.x,
      y: data.y,
      radius: data.radius,
      width: data.width,
      height: data.height,
      speed: data.speed
    }
    //Save joined socket
    playerSockets[socket.id] = socket;
    broadcastToAll('player join', onlinePlayers);
  });

  socket.on('player move', (data) => {
    if(!onlinePlayers[socket.id]) {return };
    let currentPlayer = onlinePlayers[socket.id];
    const originalSpeed = currentPlayer.speed;
    let sp = data.boost ? 4 : originalSpeed;
    let dx=dy=0;
//    const FACES = {UP: 3, DOWN: 0, LEFT: 1, RIGHT: 2};
    const FACES = {UP: 3, DOWN: 0, LEFT: 1, RIGHT: 2};
    let currentFace = 0;

    if(data.left) {
      dx = -1;
      currentFace = FACES.LEFT;
    } 
    if(data.right) {
      dx = 1;
      currentFace = FACES.RIGHT;
    } 
    if(data.up) {
      dy = -1;
      currentFace = FACES.UP;
    } 
    if(data.down) {
      dy = 1;
      currentFace = FACES.DOWN;
    }
    let length = Math.sqrt(dx**2 + dy**2);
    if(length != 0){
      dx /= length;
      dy /= length;
      currentPlayer.x += dx * sp;
      currentPlayer.y += dy * sp;
    }
    checkCircleToCircleCollision(currentPlayer, onlinePlayers);
    inField(currentPlayer);
    inFieldExp(currentPlayer, currentFace);
    broadcastToAll('position update', {
      name: currentPlayer.name,
      x: currentPlayer.x,
      y: currentPlayer.y,
      currentFace: currentFace
    });
  });

  socket.on('disconnect', (_) => {
    //Terminate directly if socket is invalid
    if (!onlinePlayers[socket.id]) return;
    console.log(`Player ${onlinePlayers[socket.id].name} disconnected`)
    //First broadcast to everyone about a player disconnection
    broadcastToAll('player leave', { name: onlinePlayers[socket.id].name });
    //Remove it from the online layer
    delete onlinePlayers[socket.id];
    delete playerSockets[socket.id];
  });
});
