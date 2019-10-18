const express = require('express');
const http = require('http');
const unixWebSocket = require('socket.io');
const app = express();
const server = http.Server(app);
const PORT = 1234;
const io = unixWebSocket(server);
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

function inField(data) {
  if (!data) return;
  if ((data.x - data.radius - data.speed) < 0) {
    data.x = data.radius;
  }
  else if ((data.x + data.radius + data.speed) > WIDTH) {
    data.x = WIDTH - data.radius;
  }
  if ((data.y - data.radius - data.speed) < 0) {
    data.y = data.radius;
  }
  else if ((data.y + data.radius + data.speed) > HEIGHT) {
    data.y = HEIGHT - data.radius;
  }
}

function circleToCircleCollision(srcX, srcY, srcRadius, trgX, trgY, trgRadius) {
  if((srcRadius + trgRadius) > Math.sqrt(((srcX - trgX) * (srcX - trgX)) + ((srcY - trgY) * (srcY - trgY)))) {
    return true;
  }
  return false; 
}

function checkCircleToCircleCollision(src, trg) {
  //All of our players are circles, pretty much check CtC
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
      speed: data.speed
    }
    //Save joined socket
    playerSockets[socket.id] = socket;
    broadcastToAll('player join', onlinePlayers);
  });

  socket.on('player move', (data) => {
    if(!onlinePlayers[socket.id]) {return };
    let currentPlayer = onlinePlayers[socket.id];
    
    currentPlayer.speed = data.boost ? 25 : 5;
    if(data.left) {
      currentPlayer.x -= currentPlayer.speed;
    } if(data.right) {
      currentPlayer.x += currentPlayer.speed;
    } if(data.up) {
      currentPlayer.y -= currentPlayer.speed;
    } if(data.down) {
      currentPlayer.y += currentPlayer.speed;
    }
    checkCircleToCircleCollision(currentPlayer, onlinePlayers);
    inField(currentPlayer);
    broadcastToAll('position update', {
      name: currentPlayer.name,
      x: currentPlayer.x,
      y: currentPlayer.y
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
