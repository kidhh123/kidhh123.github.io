
function loadDoc(){
	var req = new XMLHttpRequest();
	req.onreadystatechange = function() {
		if (this.readyState == 4 && this.status == 200) {
		  document.getElementById("output").innerHTML = this.responseText;
		}
	};
	req.open("GET","azurShip.txt");
	req.send();
}