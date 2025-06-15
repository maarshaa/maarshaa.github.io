// === HELPER FUNCTIONS ===
function gotFaces(results) {
	faces = results;
}

let canvas_scale = 0.75;

// GAME STATE
let gameState = "start"; // 'start', 'playing', 'gameover'
let startTimer = 0;
let startTriggered = false;
let startDuration = 2000;

// PHYSICS
let Engine = Matter.Engine,
	World = Matter.World,
	Bodies = Matter.Bodies,
	Body = Matter.Body;
let engine, world, physicsCircle;
let gameOver = false;

// GRAPHICS
let mascots = [],
	mascotOpen = [],
	mask = [],
	maskOpen = [];
let selectedMascot;
let wallSegments = [],
	smallWalls = [],
	midWalls = [],
	highWalls = [];
let dangerWallImages = {};
let selectedWallType;
let dangerWallLimit = 50,
	dangerWallsUsed = 0;
let over;

//SOUNDS
let backgroundMusic;
let gameOverSound;

// FACE TRACKING
let faceMesh,
	video,
	faces = [],
	video_on = true,
	nose;
let options = { maxFaces: 1, refineLandmarks: false, flipHorizontal: false };

// INTERACTION
let mouth_dist,
	mouthPreviouslyOpen = false,
	groundShouldMove = false;
let restartTimer = 0,
	restartDuration = 2000,
	restartTriggered = false;
let musicStarted = false;

// SCORE
let score = 0,
	highScore = 0;

// WALL SPEED
let wallSpeed = 3,
	speedMultiplier = 1,
	speedIncreaseRate = 0.001;

function preload() {
	faceMesh = ml5.faceMesh(options);
	over = loadImage("images/game_over.png");

	mascots.push(loadImage("images/mascot_pigeon.png"));
	mascots.push(loadImage("images/mascot_fish.png"));
	mascots.push(loadImage("images/mascot_slime.png"));

	mascotOpen.push(loadImage("images/mascot_pigeon_jump.png"));
	mascotOpen.push(loadImage("images/mascot_fish_jump.png"));
	mascotOpen.push(loadImage("images/mascot_slime_jump.png"));

	mask.push(loadImage("images/mask_pigeon_closed.png"));
	mask.push(loadImage("images/mask_fish_closed.png"));
	mask.push(loadImage("images/mask_slime_closed.png"));

	maskOpen.push(loadImage("images/mask_pigeon_opened.png"));
	maskOpen.push(loadImage("images/mask_fish_opened.png"));
	maskOpen.push(loadImage("images/mask_slime_opened.png"));

	soundFormats("mp3", "ogg");
	backgroundMusic = loadSound("sounds/background.mp3");
	gameOverSound = loadSound("sounds/gameOver.mp3");

	let wallTypes = ["box", "grass", "wave"];
	selectedWallType = random(wallTypes);

	for (let h of ["low", "mid", "high"]) {
		let img = loadImage(`images/${h}_${selectedWallType}.png`);
		if (h === "low") smallWalls.push(img);
		else if (h === "mid") midWalls.push(img);
		else highWalls.push(img);
	}

	dangerWallImages[selectedWallType] = loadImage(
		`images/${selectedWallType}-death.png`
	);
	selectedMascot = random(mascots);
}

function setup() {
	createCanvas(1280 * canvas_scale, 960 * canvas_scale);

	video = createCapture(VIDEO);
	video.size(1280 * canvas_scale, 960 * canvas_scale);
	video.hide();
	faceMesh.detectStart(video, gotFaces);

	noStroke();
	imageMode(CORNER);

	engine = Engine.create();
	world = engine.world;

	physicsCircle = Bodies.circle(200, 50, 20, {
		restitution: 0.3,
		friction: 0.5,
		density: 0.1,
	});
	World.add(world, physicsCircle);

	for (let i = 0; i < 200; i++) {
		createWallSegment(i);
	}

	highScore = int(localStorage.getItem("highScore")) || 0;
}

function createWallSegment(index) {
	let isDanger = false;
	let wallImage, wallHeight;

	if (dangerWallsUsed < dangerWallLimit && random() < 0.1) {
		isDanger = true;
		wallImage = dangerWallImages[selectedWallType];
		wallHeight = 120;
		dangerWallsUsed++;
	} else {
		let heightCategory = random(["low", "mid", "high"]);
		if (heightCategory === "low") {
			wallImage = random(smallWalls);
			wallHeight = 90;
		} else if (heightCategory === "mid") {
			wallImage = random(midWalls);
			wallHeight = 165;
		} else {
			wallImage = random(highWalls);
			wallHeight = 250;
		}
	}

	wallImage.resize(120, wallHeight);
	let segment = Bodies.rectangle(
		index * 120,
		700 - wallHeight / 2,
		120,
		wallHeight,
		{ isStatic: true }
	);

	segment.wallImage = wallImage;
	segment.wallHeight = wallHeight;
	segment.isDanger = isDanger;

	wallSegments.push(segment);
	World.add(world, segment);
}

function draw() {
	background(0);

	if (video_on) {
		push();
		translate(width, 0);
		scale(-1, 1);
		image(video, 0, 0, width, height);
		pop();
	}

	handleFaceTracking();
	handlePhysics();
	handleWalls();
	drawMascotOrGameOver();
	drawScore();
}

function handleFaceTracking() {
	if (faces.length === 0) return;

	let face = faces[0];
	let mouth_top = face.keypoints[0];
	let mouth_bottom = face.keypoints[200];
	nose = face.keypoints[1];

	mouth_dist = dist(mouth_top.x, mouth_top.y, mouth_bottom.x, mouth_bottom.y);

	let leftEye = face.keypoints[33];
	let rightEye = face.keypoints[263];
	let eyeDist = dist(leftEye.x, leftEye.y, rightEye.x, rightEye.y);
	let angle = atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);

	let maskIndex = mascots.indexOf(selectedMascot);
	let currentMask = mouthPreviouslyOpen
		? maskOpen[maskIndex]
		: mask[maskIndex];

	push();
	translate(width - nose.x, nose.y);
	rotate(-angle);
	imageMode(CENTER);
	image(currentMask, 0, 0, eyeDist * 4.5, eyeDist * 4.5);
	pop();

	let mouthJustOpened = mouth_dist > 70 && !mouthPreviouslyOpen;
	mouthPreviouslyOpen = mouth_dist > 70;

	if (mouthJustOpened) {
		// Musikstart bei erstem Mundöffnen
		if (!musicStarted) {
			backgroundMusic.loop();
			musicStarted = true;
		}

		if (!groundShouldMove) groundShouldMove = true;
		if (!gameOver && physicsCircle.position.y > 100) {
			Body.applyForce(physicsCircle, physicsCircle.position, {
				x: 0.3,
				y: -4,
			});
		}
	}
}

function handlePhysics() {
	Engine.update(engine);

	let pos = physicsCircle.position;
	if (
		!gameOver &&
		(pos.y > height + 100 ||
			pos.y < -100 ||
			pos.x < -100 ||
			pos.x > width + 100)
	) {
		triggerGameOver();
	}

	if (!gameOver && groundShouldMove) {
		score++;
		speedMultiplier += speedIncreaseRate;
	}
}

function handleWalls() {
	for (let seg of wallSegments) {
		if (groundShouldMove && !gameOver) {
			Body.translate(seg, { x: -wallSpeed * speedMultiplier, y: 0 });
			if (seg.position.x < -400) {
				let maxX = Math.max(...wallSegments.map((w) => w.position.x));
				World.remove(world, seg);
				wallSegments.splice(wallSegments.indexOf(seg), 1);
				createWallSegment((maxX + 120) / 120);
				continue;
			}
		}

		let imgX = seg.position.x - 60;
		let imgY = seg.position.y + seg.wallHeight / 2 - seg.wallHeight;
		image(seg.wallImage, imgX, imgY, 120, seg.wallHeight);

		if (!gameOver && seg.isDanger) {
			let dx = abs(seg.position.x - physicsCircle.position.x);
			let dy = abs(seg.position.y - physicsCircle.position.y);
			if (dx < 70 && dy < seg.wallHeight / 2 + 20) {
				triggerGameOver();
			}
		}
	}
}

function triggerGameOver() {
	gameOver = true;
	gameOverSound.play();
	if (backgroundMusic.isPlaying()) {
		backgroundMusic.stop();
	}
	if (score > highScore) {
		highScore = score;
		localStorage.setItem("highScore", highScore);
	}
}

function drawMascotOrGameOver() {
	if (!gameOver) {
		let mascotIndex = mascots.indexOf(selectedMascot);
		let currentMascot = mouthPreviouslyOpen
			? mascotOpen[mascotIndex]
			: selectedMascot;
		currentMascot.resize(400, 200);
		imageMode(CENTER);
		image(
			currentMascot,
			physicsCircle.position.x,
			physicsCircle.position.y,
			80,
			80
		);
		imageMode(CORNER);
	} else {
		showGameOverOverlay();
		if (mouth_dist > 70) {
			if (!restartTriggered) {
				restartTimer = millis();
				restartTriggered = true;
			}
		} else {
			restartTriggered = false;
		}

		if (restartTriggered) {
			let elapsed = millis() - restartTimer;
			drawProgressCircle(elapsed / restartDuration);
			if (elapsed >= restartDuration) {
				location.reload();
			}
		}
	}
}

function drawScore() {
	fill(255);
	textFont("Courier New");
	textStyle(BOLD);
	textSize(20);
	textAlign(LEFT, TOP);
	text("Score: " + score, 20, 20);
	text("High Score: " + highScore, 20, 50);
}

function drawProgressCircle(progress) {
	let radius = 20;
	let x = width / 2;
	let y = height / 2 + 20;

	push();
	noFill();
	stroke(160, 180, 180);
	strokeWeight(6);
	ellipse(x, y, radius * 2);

	stroke(0);
	let angle = TWO_PI * constrain(progress, 0, 1);
	arc(x, y, radius * 2, radius * 2, -HALF_PI, -HALF_PI + angle);
	pop();
}

function showGameOverOverlay() {
	fill(0, 0, 0, 200);
	rect(0, 0, width, height);

	over.resize(1000, 600);
	image(over, width / 2 - 500, height / 2 - 300);

	textAlign(CENTER, CENTER);
	textStyle(BOLD);
	textFont("Verdana");
	textSize(64);
	fill(160, 180, 180);
	text("GAME OVER", width / 2, height / 2 - 80);

	textStyle(NORMAL);
	textFont("Verdana");
	textSize(20);
	fill(160, 180, 180);
	text("TIP: close your mouth in between jumps", width / 2, height / 2 - 30);
	textFont("Courier New");
	textSize(20);
	fill(0);
	text("open your mouth to restart", width / 2, height / 2 + 70);
}

function keyReleased() {
	if (key === "v") {
		video_on = !video_on;
		print("video_on = " + video_on);
	}
}
