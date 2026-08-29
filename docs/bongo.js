const BONGO = "/img/bongo.gif"
const BONGOL = "/img/bongol.gif"
const BONGOR = "/img/bongor.gif"
const BONGOM = "/img/bongom.gif"

const bongocat = document.querySelector("#bongocat")


function getRandomImg() {
    switch(Math.floor(Math.random()*4)) {
        case 0:
            return BONGO;
        case 1:
            return BONGOL;
        case 2:
            return BONGOR;
        case 3:
            return BONGOM;
    }
}
function swapBongo() {
    bongocat.src = getRandomImg()
}
window.setInterval(swapBongo, 250);