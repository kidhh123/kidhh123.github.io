

const canvas = document.getElementById('tetris');
const context = canvas.getContext('2d');
const queueCanvas = document.getElementById('queueCanvas');
const context2 = queueCanvas.getContext('2d');
const holdCanvas = document.getElementById('holdCanvas');
const context3 = holdCanvas.getContext('2d');
const version = "0.3.0";
document.title = "Tetris clone v"+version;


context.fillStyle = '#FFF';
context.fillRect(0,0,canvas.width,canvas.height);

/*parameters*/
var dropSpeed = 000;//ms
var score = 0;
var world;
var player;
var pieceCounter = [0,0,0,0,0,0,0];
var hold=null;
/*initialize operation*/

//world creating
function createMatrix(w,h){
	var matrix = [];
	while(h--){
		matrix.push(new Array(w).fill(0));
	}
	return matrix;
}

function createWorld(){
	//create world array which is filling with 0s (means nothing inside)
	world = createMatrix(12,22);
	//set world's border to -1
	world.forEach((row,y) => {
		row.forEach((value,x)=>{
			if(x==0 || x==11 || y==21){
				world[y][x] = -1;
			}
		});
	});
}

createWorld();
//tetrominoes settings//{
//                                       0 0 0 0 presented with a 4x4 array, 
//array number : rotations (clockwise)   0 1 1 0              1 means solid,
//pieces: t i o sz lj                    0 1 1 0              0 means blank.
//                                       0 0 0 0 << this is a "o" piece, so the code will be "0000 0110 0110 0000".
const tM = [0B0000111001000000,0B0100110001000000,0B0100111000000000,0B0100011001000000];
const iM = [0B0100010001000100,0B0000111100000000,0B0010001000100010,0B0000000011110000];
const oM = [0B0000011001100000,0B0000011001100000,0B0000011001100000,0B0000011001100000];
const sM = [0B0110110000000000,0B0100011000100000,0B0000011011000000,0B1000110001000000];
const zM = [0B1100011000000000,0B0010011001000000,0B0000110001100000,0B0100110010000000];
const lM = [0B0100010001100000,0B0000111010000000,0B1100010001000000,0B0010111000000000];
const jM = [0B0100010011000000,0B1000111000000000,0B0110010001000000,0B0000111000100000];

const allP = [tM,iM,oM,sM,zM,lM,jM];

//}end of pieces settings

//make tetrominoes data to shape//{

function makeShape(m,t){
	var count = 0;
	var tmp;
	var a = createMatrix(16,1);
	while(count < 16){
		if(m%2==0){
			tmp = m%2;
			m /= 2;
		}else{
			tmp = m%2;
			m = (m-1)/2;
		}
		a[0][15-count]=tmp;
		count++;
	}
	
	var s = createMatrix(4,4);
	count = 0;
	for(var y=0;y<4;y++){
		for(var x=0;x<4;x++){
			s[y][x] = (t+1)*a[0][count++];
		}
	}
	return s;
}
//}end of shape making

//collide handling//{

function willCollide(p){
	
	for(var y = 0;y < p.shape.length;y++){
		for(var x = 0;x < p.shape[y].length;x++){
			if(p.shape[y][x] != 0 && world[y+p.pos.Y][x+p.pos.X] != 0){//means overlap
				//console.log("collide at:"+ (y+p.pos.Y) + " " + (x+p.pos.X));
				return true;
			}
		}
	}
	return false;
}

//}end of collide handling

//check row to clear//{
function checkRow(y){
	var check = 0;
	var tmpscore = 0;
	if(y<=20 && y>=1){
		for(var x=1;x<=10;x++){
			//console.log("check row y:"+y+" x:"+x+" value:"+world[y][x]);
			if(world[y][x]!=0)
				check++;
		}
		if(check == 10){//this lane need clear
			return true;
		}
	}
}
//clear row
function clearRow(y){
	for(var my=y;my>1;my--){
		for(var x=1;x<=10;x++){
			world[my][x] = world[my-1][x];
		}
	}
	for(var x=1;x<=10;x++)
		world[1][x] = 0;
}
//}

//pieces handling

var pieceQueue = [];
nextPiece();

function createQueue(arr){
	var tmp  = shuffle([0,1,2,3,4,5,6]);
	for(var i=0;i<tmp.length;i++){
		arr.push([tmp[i],Math.floor(Math.random()*3)]);
	}
}

function nextPiece(){
	if(pieceQueue.length < 6)
		createQueue(pieceQueue);
	
	var tmp = pieceQueue.shift();
	player = new Piece({X:4,Y:0},tmp[0],tmp[1]);
	player.hPos = harddropPos();
	
	if(willCollide(player)){
		console.log("game over! score: "+ score);
			//reset
		score = 0;			
		pieceQueue = [];
		pieceCounter = [0,0,0,0,0,0,0];
		hold = null;
		nextPiece();
		createWorld();
	}
}


function shuffle(arr){
	if(!Array.isArray(arr))
		return "not array";
	
	for(var i=0;i<arr.length;i++){
		var g = Math.floor(Math.random()*arr.length);
		tmp = arr[i];
		arr[i] = arr[g];
		arr[g] = tmp;
	}
	
	return arr;
}

function Piece(pos,type,rotate){
	this.pos = pos;
	this.type = type;
	this.rotate = rotate;
	this.shape = makeShape(allP[this.type][this.rotate],this.type);
	this.hPos;
	
	this.rotateP = function(d){//direction
		if(d == "clockwise")
			(this.rotate==3) ? this.rotate=0 : this.rotate++;
		else if(d == "counterclockwise")
			(this.rotate==0) ? this.rotate=3 : this.rotate--;
		
		this.shape = makeShape(allP[this.type][this.rotate],this.type);
	}
	
}

function harddropPos(){
	var piece = new Piece({X:player.pos.X,Y:player.pos.Y},player.type,player.rotate);
	while(!willCollide(piece)){
		piece.pos.Y++;
	}
	piece.pos.Y--;
	
	return piece.pos;
}

//merge piece's shape with world and score counting//
function placePiece(){
	var s = 0;
	player.shape.forEach((row,y)=>{//checking each row while merging it
		//merging this row
		row.forEach((value,x)=>{
			if(player.shape[y][x]!=0){
				world[player.pos.Y+y][player.pos.X+x] = player.shape[y][x];
			}
		});
		//checking this row need to be cleared or not
		if(checkRow(player.pos.Y+y)){
			s+=1;
			clearRow(player.pos.Y+y);
		}
	});
	
	//score calculating 
	if(s>0){
		switch(s){
			case 1:
				console.log("single!");
				break;
			case 2:
				console.log("double!");
				break;
			case 3:
				console.log("triple!");
				break;
			case 4:
				console.log("tetris!");
				s=6;
				break;
		}
		score+=s;
		console.log("row clear! get score:"+s+" total score:"+score);
	}
	
	//piece counting
	pieceCounter[player.type]++;
}

//slow dropping function
var dropCounter = 0;
var lastTime = 0;
function slowDrop(speed,time){
	if(dropSpeed == 0){
		return;
	}
	var deltatime = time - lastTime;
	lastTime = time;
	dropCounter += deltatime;
	if(dropCounter >= speed){
		dropPiece();
	}
}

//dropping piece with bottom colliding detect
function dropPiece(){
	
	var tmp = new Piece({X:player.pos.X,Y:player.pos.Y+1},player.type,player.rotate);
	
	if(!willCollide(tmp)){
		player.pos.Y++;
		dropCounter=0;
	}else{//lock
		placePiece();
		nextPiece();
	}
}

//wall kick
function wallKick(piece){
	var x_offset = [1,-1,2,-2];
	var y_offset = [0,1,2];
	for(var j=0;j<3;j++){
		for(var i=0;i<x_offset.length;i++){
			var tmp = new Piece({X:piece.pos.X+x_offset[i] , Y:piece.pos.Y+y_offset[j]},piece.type,piece.rotate);
			if(!willCollide(tmp)){
				return {X:x_offset[i],Y:y_offset[j]};
			}
		}
	}
	return false;
}

//player control handling//{
document.addEventListener('keydown',event => {

	var tmp = new Piece({X:player.pos.X,Y:player.pos.Y},player.type,player.rotate);
	let offset = {};
	
	switch(event.keyCode){
		case 37://key left
			tmp.pos.X--
			if(!willCollide(tmp)){
				player.pos.X--;
				player.hPos = harddropPos();
			}
			break;
		case 88://key x
		case 38://key up : rotate clockwise
			//console.log("up: rotate clockwise");			
			tmp.rotateP("clockwise");
			if(!willCollide(tmp)){
				player.rotateP("clockwise");
				player.hPos = harddropPos();
			}else if((offset = wallKick(tmp)) != false){
				player.rotateP("clockwise");
				player.pos.X += offset.X;
				player.pos.Y += offset.Y;
				player.hPos = harddropPos();
			}
			break;
		case 39://key right
			tmp.pos.X++;
			if(!willCollide(tmp)){
				player.pos.X++;
				player.hPos = harddropPos();
			}
			break;
		case 40://key down
			//console.log("drop down");
			dropPiece();
			break;
		case 90://key z
			tmp.rotateP("counterclockwise");
			if(!willCollide(tmp)){
				player.rotateP("counterclockwise");
				player.hPos = harddropPos();
			}else if((offset = wallKick(tmp)) != false){
				player.rotateP("counterclockwise");
				player.pos.X += offset.X;
				player.pos.Y += offset.Y;
				player.hPos = harddropPos();
			}
			break;
		case 32://key space
			player.pos = player.hPos;
			placePiece();
			nextPiece();
			break;
		case 67://key c
			if(hold == null){
				hold = new Piece({X:4,Y:0},player.type,player.rotate);
				nextPiece();
			}else{
				player = new Piece(hold.pos,hold.type,hold.rotate);
				hold = new Piece({X:4,Y:0},tmp.type,tmp.rotate);
				player.hPos = harddropPos();
			}
			break;
	}
});
//}

/////////////////////////////////////////////////

 

update();
//game main function//{
function update(time=0){
	//drop piece by dropspeed
	slowDrop(dropSpeed,time);
	//clear board
	context.fillStyle = '#FFF';
	context.fillRect(0,0,canvas.width,canvas.height);
	//
	
	
	drawWorld();
	drawPlayer();
	drawQueue();
	drawHold();
	//run update function next frame
	requestAnimationFrame(update);
}
//end of main function//}

//drawing function
function drawPlayer(){
	//draw hard drop position
	player.shape.forEach((row,y)=>{
		row.forEach((value,x)=>{
			if(player.shape[y][x] != 0){
				context.lineWidth = 3;
				context.strokeStyle = 'white';
				context.strokeRect(25*(x+player.hPos.X)+4,25*(y+player.hPos.Y)+4,16,16);
			}
		});
	});
	
	//draw player piece
	player.shape.forEach((row,y) =>{
		row.forEach((value, x) =>{
			if(player.shape[y][x] != 0){
				switch(player.shape[y][x]){//tioszlj
					case 1:
						fillPiece(context,player.pos.X+x,player.pos.Y+y,'mediumpurple','purple');
						break;
					case 2:
						fillPiece(context,player.pos.X+x,player.pos.Y+y,'darkcyan','cyan');
						break;
					case 3:
						fillPiece(context,player.pos.X+x,player.pos.Y+y,'goldenrod','gold');
						break;
					case 4:
						fillPiece(context,player.pos.X+x,player.pos.Y+y,'green','lawngreen');
						break;
					case 5:
						fillPiece(context,player.pos.X+x,player.pos.Y+y,'darkred','red');
						break;
					case 6:
						fillPiece(context,player.pos.X+x,player.pos.Y+y,'darkorange','orange');
						break;
					case 7:			
						fillPiece(context,player.pos.X+x,player.pos.Y+y,'darkblue','blue');
						break;
				}				
			}
		});
	});	
}
//
function drawWorld(){
	//color up pieces and borders
	world.forEach((row,y) =>{
		row.forEach((value, x) =>{
			if(x==0 || x==11 || y==0 || y==21){
				context.fillStyle = 'black';
				context.fillRect(x*25,y*25,25,25);
			}
			else if(world[y][x]!=0){
				switch(world[y][x]){
					case 1:
						fillPiece(context,x,y,'mediumpurple','purple');
						break;
					case 2:
						fillPiece(context,x,y,'darkcyan','cyan');
						break;
					case 3:
						fillPiece(context,x,y,'goldenrod','gold');
						break;
					case 4:
						fillPiece(context,x,y,'green','lawngreen');
						break;
					case 5:
						fillPiece(context,x,y,'darkred','red');
						break;
					case 6:
						fillPiece(context,x,y,'darkorange','orange');
						break;
					case 7:			
						fillPiece(context,x,y,'darkblue','blue');
						break;
				}
			}else{
				context.fillStyle = 'dimgrey';
				context.fillRect(x*25,y*25,25,25);
			}
		});
	});
	
	//draw border and arena lines
	world.forEach((row,y) =>{
		row.forEach((value, x) =>{
			if(x!=0 && x!=11 && y!=0 && y!=21){
				context.lineWidth = 1;
				context.strokeStyle = 'grey';	
				context.strokeRect(x*25,y*25,25,25);
			}
		});
	});
	
	return("world drawed");
}

function drawQueue(){
	var qPiece;
	for(var i=0;i<5;i++){
		context2.fillStyle = 'black';
		context2.fillRect(0,i*150,125,150);
		
		qPiece = new Piece({X:0,Y:0},pieceQueue[i][0],pieceQueue[i][1]);
		qPiece.shape.forEach((row,y) =>{
			row.forEach((value, x) =>{
				if(qPiece.shape[y][x]!=0 ){
					switch(qPiece.shape[y][x]){//tioszlj
						case 1:
							fillPiece(context2,x+1,1+y+i*4,'mediumpurple','purple');
							break;
						case 2:
							fillPiece(context2,x+1,1+y+i*4,'darkcyan','cyan');
							break;
						case 3:
							fillPiece(context2,x+1,1+y+i*4,'goldenrod','gold');
							break;
						case 4:
							fillPiece(context2,x+1,1+y+i*4,'green','lawngreen');
							break;
						case 5:
							fillPiece(context2,x+1,1+y+i*4,'darkred','red');
							break;
						case 6:
							fillPiece(context2,x+1,1+y+i*4,'darkorange','orange');
							break;
						case 7:			
							fillPiece(context2,x+1,1+y+i*4,'darkblue','blue');
							break;
					}				
				}
			});
		});
	}
}

function drawHold(){
	context3.fillStyle = 'black';
	context3.fillRect(0,0,150,150);
	context3.strokeStyle = 'darkgrey';
	context3.lineWidth = 4;
	context3.strokeRect(0,0,150,150);
	
	if( hold!= null){
		hold.shape.forEach((row,y)=>{
			row.forEach((value,x)=>{
				if(hold.shape[y][x]!=0){
					switch(hold.shape[y][x]){
							case 1:
								fillPiece(context3,x+1,y+1,'mediumpurple','purple');
								break;
							case 2:
								fillPiece(context3,x+1,y+1,'darkcyan','cyan');
								break;
							case 3:
								fillPiece(context3,x+1,y+1,'goldenrod','gold');
								break;
							case 4:
								fillPiece(context3,x+1,y+1,'green','lawngreen');
								break;
							case 5:
								fillPiece(context3,x+1,y+1,'darkred','red');
								break;
							case 6:
								fillPiece(context3,x+1,y+1,'darkorange','orange');
								break;
							case 7:			
								fillPiece(context3,x+1,y+1,'darkblue','blue');
								break;
					}
				}
			});
		});
	}
}

function fillPiece(ctx,x,y,c1,c2){
	ctx.fillStyle = c1;
	ctx.fillRect(x*25+1,y*25+1,23,23);
	ctx.fillStyle = c2;
	ctx.fillRect(x*25+2,y*25+2,21,21);
}