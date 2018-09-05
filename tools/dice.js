//dnd 4 6 8 10 12 20 100
var simpleFace = 6;

function changeRollSheet(me){
	
	//console.log(me);
	document.getElementsByClassName("sheetTag active")[0].className = "sheetTag";
	me.className = "sheetTag active";
	
	let id = me.getAttribute("value");
	document.getElementsByClassName("rollSheet active")[0].className = "rollSheet";
	document.getElementById(id).className = "rollSheet active";
	
}

//simple
function simpleDiv_chooseFace(me){
	//clear chosed button's class
	document.getElementsByClassName("faceChoice chosed")[0].className = "faceChoice";
	
	me.className = "faceChoice chosed";
	simpleFace = me.getAttribute("value");
}

function simpleDiv_roll(){	
	let diceNum = document.getElementById("simpleDiceNumber").value;
	if(isNaN(diceNum)){
		diceNum = 1;
		console.log("error: input isn't a number!")
	}
	let rollResult = rollDice(simpleFace,diceNum);
	simpleDiv_resultOutput(rollResult);
}

function simpleDiv_resultOutput(rollResult){
	//document.getElementsByClassName("result")[0].innerHTML;
	let output = "";
	for(let i=0;i<rollResult.length;i++){
		output += (rollResult[i] + "<br>");
	}
	document.getElementsByClassName("result")[0].innerHTML = output;
}

//dnd
function dndDiv_roll(index){
	let face = [4,6,8,10,12,100,20];
	let sign = "d"+face[index]+"sign";
	let diceNum = document.getElementsByClassName("dndDiceNumber")[index].childNodes[0].value;
	diceNum == "" ? diceNum=1 : diceNum;
	let modifier = document.getElementsByClassName("dndModifier")[index].childNodes[0].value;
	modifier == "" ? modifier=0 : modifier;
	let modifierSign = document.getElementsByName(sign)[0];
	//console.log(rollDice(face[index],diceNum));
	
	if(document.getElementsByClassName("dndExclude")[index].childNodes[0].checked)
		console.log("exclude min");
	if(document.getElementsByClassName("dndExclude")[index].childNodes[2].checked)
		console.log("exclude max");
	
	if(modifierSign.checked)
		console.log(diceNum+"d"+face[index]+"+"+modifier);
	else
		console.log(diceNum+"d"+face[index]+"-"+modifier);
	
	//document.getElementById("dndResult").innerHTML = rollDice(face[index],diceNum);

}
function dndClear(){
	let result = document.getElementById("dndResult");
	result.innerHTML = "";
	console.log("clear dnd");
}
//custom
function customDiv_eventHandler(){

}
//
function rollDice(face=6,number=1){
	var output=[];
	for(let i=0;i<number;i++)
		output.push(Math.floor(Math.random()*face+1));
	return output;
}
//output optimize: ordinal number
function getOrdinal(value){
  if(isNaN(value))
    return "not a number!";
  var output="";
  switch(value%10){
    case 1:
      if(value > 10)
        output += Math.floor(value/10);
      output += "1st";
      break;
    case 2:
      if(value > 10)
        output += Math.floor(value/10);
      output += "2nd";
      break;
    case 3:
      if(value > 10)
        output += Math.floor(value/10);
      output += "3rd";
      break;
    default:
      if(value > 10)
        output += Math.floor(value/10);
      output += (value%10 + "th");
      break;
  }
  return output;
}