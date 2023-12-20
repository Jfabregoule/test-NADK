/*
//-------------------------------------------------------------------------------------------------------------------------------------------------------
|																																						|
|																																						|
|							---------------------------------------------------------------------------------------------								|
|							|																							|								|
|							|											Setup											|								|
|							|																							|								|
|							---------------------------------------------------------------------------------------------								|
|																																						|
|																																						|
//-------------------------------------------------------------------------------------------------------------------------------------------------------
*/

/*
---------------------------------------------------------------------------------------------
|																							|
|										Imports												|
|																							|
---------------------------------------------------------------------------------------------
*/

import {
	publicToken,
	mainSceneUUID,
	characterControllerSceneUUID,
	objectMeshUUID,
	mirrorSceneUUID,
	phantomMeshUUID,
} from "./config.js";

/*
---------------------------------------------------------------------------------------------
|																							|
|										Init App											|
|																							|
---------------------------------------------------------------------------------------------
*/

window.addEventListener("load", InitApp);

//------------------------------------------------------------------------------
async function InitApp() {
	await SDK3DVerse.startSession({
		userToken: publicToken,
		sceneUUID: mainSceneUUID,
		canvas: document.getElementById("display-canvas"),
		connectToEditor: true,
		startSimulation: "on-assets-loaded",

	});
	await SDK3DVerse.engineAPI.startSimulation();
	await InitFirstPersonController(characterControllerSceneUUID);

	//await InitObject(objectMeshUUID);
	//await InitMirror(mirrorSceneUUID);
	//await InitEnemy(phantomMeshUUID);

	// init console log for C++
	const engineOutputEventUUID = "9d62edc3-d096-40fd-ba7d-60550c050cf1";
	SDK3DVerse.engineAPI.registerToEvent(engineOutputEventUUID, "log", (event) => console.log(event.dataObject.output));
	// Démarrer la musique
	await Game();
}

/*
---------------------------------------------------------------------------------------------
|																							|
|									Init Character											|
|																							|
---------------------------------------------------------------------------------------------
*/

async function setFPSCameraController(canvas){
	// Remove the required click for the LOOK_LEFT, LOOK_RIGHT, LOOK_UP, and
	// LOOK_DOWN actions.
	SDK3DVerse.actionMap.values["LOOK_LEFT"][0] = ["MOUSE_AXIS_X_POS"];
	SDK3DVerse.actionMap.values["LOOK_RIGHT"][0] = ["MOUSE_AXIS_X_NEG"];
	SDK3DVerse.actionMap.values["LOOK_DOWN"][0] = ["MOUSE_AXIS_Y_NEG"];
	SDK3DVerse.actionMap.values["LOOK_UP"][0] = ["MOUSE_AXIS_Y_POS"];
	SDK3DVerse.actionMap.propagate();

	// Lock the mouse pointer.
	canvas.requestPointerLock = (
	  canvas.requestPointerLock
	  || canvas.mozRequestPointerLock
	  || canvas.webkitPointerLockElement
	);
	canvas.requestPointerLock();
};

//------------------------------------------------------------------------------
async function InitFirstPersonController(charCtlSceneUUID) {
	// To spawn an entity we need to create an EntityTempllate and specify the
	// components we want to attach to it. In this case we only want a scene_ref
	// that points to the character controller scene.
	const playerTemplate = new SDK3DVerse.EntityTemplate();+
	playerTemplate.attachComponent("scene_ref", { value: charCtlSceneUUID });

	// Passing null as parent entity will instantiate our new entity at the root
	// of the main scene.
	const parentEntity = null;
	// Setting this option to true will ensure that our entity will be destroyed
	// when the client is disconnected from the session, making sure we don't
	// leave our 'dead' player body behind.
	const deleteOnClientDisconnection = true;
	// We don't want the player to be saved forever in the scene, so we
	// instantiate a transient entity.
	// Note that an entity template can be instantiated multiple times.
	// Each instantiation results in a new entity.
	const playerSceneEntity = await playerTemplate.instantiateTransientEntity(
		"Player",
		parentEntity,
		deleteOnClientDisconnection
	);

	// The character controller scene is setup as having a single entity at its
	// root which is the first person controller itself.
	const firstPersonController = (await playerSceneEntity.getChildren())[0];
	// Look for the first person camera in the children of the controller.
	const children = await firstPersonController.getChildren();
	const firstPersonCamera = children.find((child) =>
		child.isAttached("camera")
	);

	// We need to assign the current client to the first person controller
	// script which is attached to the firstPersonController entity.
	// This allows the script to know which client inputs it should read.
	SDK3DVerse.engineAPI.assignClientToScripts(firstPersonController);

	// Finally set the first person camera as the main camera.
	SDK3DVerse.setMainCamera(firstPersonCamera);

	document.addEventListener('mousedown', (event) => {
	setFPSCameraController(document.getElementById("display-canvas"));
	});
	document.addEventListener('mousedown', () => {
		const backgroundMusic = document.getElementById("backgroundMusic");
		backgroundMusic.volume = 0.1;
		backgroundMusic.play();
	});
}

/*
---------------------------------------------------------------------------------------------
|																							|
|										Init Object											|
|																							|
---------------------------------------------------------------------------------------------
*/

async function InitObject(object){

	const objectTemplate = new SDK3DVerse.EntityTemplate();
	objectTemplate.attachComponent('mesh_ref', { value : object });
	objectTemplate.attachComponent('material_ref', { value : "cf7f45ff-014b-4c2c-90fa-1deb01a2a4bb" });

	objectTemplate.attachComponent('physics_material');
	objectTemplate.attachComponent('rigid_body',{mass : 1,centerOfMass :[0.5,0.5,0.5]});
	objectTemplate.attachComponent('box_geometry',{dimension:[1,1,1],offset:[0.5,0.5,0.5]});

	const parentEntity = null;
	const deleteOnClientDisconnection = true;

	const objectEntity = await objectTemplate.instantiateTransientEntity(
		"object",
		parentEntity,
		deleteOnClientDisconnection
	);
	//SDK3DVerse.engineAPI.assignClientToScripts(objectEntity);
}

/*
//-------------------------------------------------------------------------------------------------------------------------------------------------------
|																																						|
|																																						|
|							---------------------------------------------------------------------------------------------								|
|							|																							|								|
|							|										Functions											|								|
|							|																							|								|
|							---------------------------------------------------------------------------------------------								|
|																																						|
|																																						|
//-------------------------------------------------------------------------------------------------------------------------------------------------------
*/

async function Game(){

/*
---------------------------------------------------------------------------------------------
|																							|
|											Inits											|
|																							|
---------------------------------------------------------------------------------------------
*/

	let hasSeenCinematic = false;
	let isShooting;
	const actionQueue = [];

	const persos = await SDK3DVerse.engineAPI.findEntitiesByNames('Player');
	const perso = persos[0];

	let players = await SDK3DVerse.engineAPI.findEntitiesByNames('First Person Controller');
	let player = players[0];
	const camera = SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0];

	const lightTemplate = new SDK3DVerse.EntityTemplate();
	lightTemplate.attachComponent("scene_ref", { value: '5cbfd358-45d9-4442-b4bf-dd1b4db5776f' });
	lightTemplate.attachComponent('local_transform', { position : [0, 0, 0] });

	//const lights = await SDK3DVerse.engineAPI.findEntitiesByEUID('558bc544-e587-4582-8835-738687d960b2');
	let lights = [];

	isShooting = false;

	let tmp = await SDK3DVerse.engineAPI.findEntitiesByNames('Cinematic trigger');
	let FirstCinematicTrigger = tmp[0];

	let cubeBox = await SDK3DVerse.engineAPI.findEntitiesByNames('Cube box');

	let triggerBoxes = await SDK3DVerse.engineAPI.findEntitiesByNames('Battle_light');
	let buttons = [];
	triggerBoxes.push(...tmp);
	triggerBoxes.push(...cubeBox);

	let mirrors = [];
	let MirrorsShoot = [];

	for (let i = 0; i < mirrors.length; i++)
		MirrorsShoot[i] = false;

	let focusedBeams = [];

	let isGrabbing = false;
	let grabbedEntity;
	let grabbable = [];

	let isBehavior = true;

	let tagged = [];

	async function GetTags()
	{
		const componentFilter = { mandatoryComponents : ['tags']};
		tagged = await SDK3DVerse.engineAPI.findEntitiesByComponents(componentFilter);
		for (let i = 0; i < tagged.length; i++)
		{
			if (tagged[i].getComponent('tags').value[0] == 'mirror')
			{
				mirrors.push(tagged[i]);
				MirrorsShoot.push(false);
			}
			else if (tagged[i].getComponent('tags').value[0] == 'button')
				buttons.push(tagged[i]);
			else if (tagged[i].getComponent('tags').value[0] == 'light')
				lights.push(tagged[i]);
		}
	}
	await GetTags();


/*
---------------------------------------------------------------------------------------------
|																							|
|										Collisions											|
|																							|
---------------------------------------------------------------------------------------------
*/

	async function	checkColls(){

			SDK3DVerse.engineAPI.onEnterTrigger((entering, zone) =>
			{
				if (entering == player && lights.includes(zone))
					actionQueue.push(() => createfocusedbeam());
				else if (entering == player && zone == FirstCinematicTrigger && !hasSeenCinematic)
				{
					console.log("Cinematic");
					PlayCinematic();
					hasSeenCinematic = true;
				}
			});
			SDK3DVerse.engineAPI.onExitTrigger((exiting, zone) =>
			{
				if (grabbable.includes(exiting) && cubeBox.includes(zone))
				{
					exiting.setGlobalTransform({position : [0, 0, 0]});
				}
				if (exiting == player && lights.includes(zone))
					actionQueue.push(() => destroyfocusedbeam());
			});
	}
	await checkColls();

	/*
---------------------------------------------------------------------------------------------
|																							|
|										Enigma												|
|																							|
---------------------------------------------------------------------------------------------
*/
async function InitEnigma(){
	enigmaDetectors = [];
	enigmaEntities = [];
	let detector = (await SDK3DVerse.engineAPI.findEntitiesByNames('wallDetector'));
	enigmaDetectors.push(...detector);
	detector = (await SDK3DVerse.engineAPI.findEntitiesByNames('redDetector'));
	enigmaDetectors.push(...detector);
	detector = (await SDK3DVerse.engineAPI.findEntitiesByNames('purpleDetector'));
	enigmaDetectors.push(...detector);
	detector = (await SDK3DVerse.engineAPI.findEntitiesByNames('lightDetector'));
	enigmaDetectors.push(...detector);

	let item = (await SDK3DVerse.engineAPI.findEntitiesByNames('cubeEntity'));
	enigmaEntities.push(...item);
	item = (await SDK3DVerse.engineAPI.findEntitiesByNames('redCube'));
	enigmaEntities.push(...item);
	item = (await SDK3DVerse.engineAPI.findEntitiesByNames('purpleCube'));
	enigmaEntities.push(...item);
	item = (await SDK3DVerse.engineAPI.findEntitiesByNames('lightCube'));
	enigmaEntities.push(...item);
}
InitEnigma()

async function Enigma(entity, detector){
	if (enigmaEntities.includes(entity) && enigmaDetectors.includes(detector)){
		
		if (entity.getName() == 'cubeEntity' && detector.getName() == 'wallDetector'){
			wall.setVisibility(false);	
			wall.detachComponent('physics_material');
		}
		if (entity.getName() == 'redCube' && detector.getName() == 'redDetector'){
			red = true;
		}
		if (entity.getName() == 'purpleCube' && detector.getName() == 'purpleDetector'){
			purple = true;
		}
		if (entity.getName() == 'lightCube' && detector.getName() == 'lightDetector'){
			light = true;
		}

		if (red && purple && light){
			wall2.setVisibility(false);	
			wall2.detachComponent('physics_material');
		}
	}
}

document.addEventListener('keyup',(event)=>{
	if(event.key == 'f'){
		ButtonEnigma();
	}
})

async function ButtonEnigma(){
	if (JSON.stringify(code) != JSON.stringify(codeTry)){
		const cameraTransform = camera.getTransform();

		// dirVect
		let directionVector = [
			SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getWorldMatrix()[8],   // X
			SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getWorldMatrix()[9],   // Y
			SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getWorldMatrix()[10]   // Z
		]; 	
		// Normalise le vecteur si nécessaire
		const magnitude = Math.sqrt(
			directionVector[0] ** 2 + directionVector[1] ** 2 + directionVector[2] ** 2
		);
		directionVector = [
			-directionVector[0] / magnitude,
			-directionVector[1] / magnitude,
			-directionVector[2] / magnitude
		];

		const origin = [
		cameraTransform.position[0] + directionVector[0], // Multiplie par la distance souhaitée
		cameraTransform.position[1] + directionVector[1],
		cameraTransform.position[2] + directionVector[2]
		];

		const rayLength = 1;
		const filterFlags = SDK3DVerse.PhysicsQueryFilterFlag.dynamic_block | SDK3DVerse.PhysicsQueryFilterFlag.record_touches;
		// Returns dynamic body (if the ray hit one) in block, and all static bodies encountered along the way in touches
		const{ block, touches } = await SDK3DVerse.engineAPI.physicsRaycast(origin, directionVector, rayLength, filterFlags);
		if (block != null )
		{
			if (block.entity.getComponent('tags')){
				if (block.entity.getComponent('tags').value[0] == 'button'){
					if (lastBtn != null){
						let pos = lastBtn.getGlobalTransform().position;
						lastBtn.setGlobalTransform({position: [pos[0] - 0.05, pos[1], pos[2]]});
						lastBtn = null;
					}
					codeTry.push(block.entity.getComponent('tags').value[1])
					let pos = block.entity.getGlobalTransform().position;
					block.entity.setGlobalTransform({position : [pos[0] + 0.05, pos[1], pos[2]]});
					lastBtn = block.entity;
				}
			}
		}
	}
	if (JSON.stringify(code) == JSON.stringify(codeTry)){
		codeTry = [];
		codeInteract.setComponent('material_ref',{value : "cf7f45ff-014b-4c2c-90fa-1deb01a2a4bb"})
	}
	if (codeTry.length == 3 && JSON.stringify(code) != JSON.stringify(codeTry)){
		codeTry = [];
		codeInteract.setComponent('material_ref',{value : "5629a0e5-e272-4be1-82e1-c8d6cef9ae76"})
	}
	return false;
}

/*
---------------------------------------------------------------------------------------------
|																							|
|										Beam												|
|																							|
---------------------------------------------------------------------------------------------
*/

	window.requestAnimationFrame(actionQueueLoop);
	async function actionQueueLoop() {
	if(!actionQueue.length) {
		window.requestAnimationFrame(actionQueueLoop);
		return;
	}

	const action = actionQueue.shift();
	await action();
	window.requestAnimationFrame(actionQueueLoop);
	}

	async function ResizeBeam(mirror)
	{
		let children = await mirror.getChildren();
		let beam = children[1];
		let mirrorTransform = mirror.getGlobalTransform();

		// Vecteur initial pointant vers l'avant (par exemple, l'axe -Z)
		const forwardVector = { x: 0, y: 0, z: -1 };

		// Effectuer la rotation du vecteur en fonction du quaternion
		const x = mirrorTransform.orientation[0],
			y = mirrorTransform.orientation[1],
			z = mirrorTransform.orientation[2],
			w = mirrorTransform.orientation[3];

		// Appliquer la rotation du quaternion à ce vecteur
		const x2 = x + x;
		const y2 = y + y;
		const z2 = z + z;
		const xx = x * x2;
		const xy = x * y2;
		const xz = x * z2;
		const yy = y * y2;
		const yz = y * z2;
		const zz = z * z2;
		const wx = w * x2;
		const wy = w * y2;
		const wz = w * z2;

		const rotatedDirection = {
			x: forwardVector.x * (1.0 - (yy + zz)) + forwardVector.y * (xy - wz) + forwardVector.z * (xz + wy),
			y: forwardVector.x * (xy + wz) + forwardVector.y * (1.0 - (xx + zz)) + forwardVector.z * (yz - wx),
			z: forwardVector.x * (xz - wy) + forwardVector.y * (yz + wx) + forwardVector.z * (1.0 - (xx + yy))
		};

		// Normaliser le vecteur résultant
		const magnitude = Math.sqrt(rotatedDirection.x * rotatedDirection.x + rotatedDirection.y * rotatedDirection.y + rotatedDirection.z * rotatedDirection.z);
		const directionVector = {
			x: rotatedDirection.x / magnitude,
			y: rotatedDirection.y / magnitude,
			z: rotatedDirection.z / magnitude
		};

		const origin = [
			mirrorTransform.position[0] + directionVector.x, // Multiplie par la distance souhaitée
			mirrorTransform.position[1] + 0.5,
			mirrorTransform.position[2] + directionVector.z
		];

		const rayLength = 100;
		const filterFlags = SDK3DVerse.PhysicsQueryFilterFlag.record_touches;

		// Effectuer le raycast
		const { block, touches } = await SDK3DVerse.engineAPI.physicsRaycast(origin, [directionVector.x, directionVector.y, directionVector.z], rayLength, filterFlags);
		for (let i = 0; i < touches.length; i++)
		{
			if (mirrors.includes(touches[i].entity))
				shootMirror(touches[i].entity);
		}
		console.log(touches);
	}

	async function shootMirror(mirror)
	{
		console.log("Shoot");
		let index = mirrors.findIndex(element => element === mirror);
		if (index != -1 && MirrorsShoot[index] == false)
		{
			MirrorsShoot[index] = true;
			//let mirrorTransform = mirror.getComponent('local_transform');
			let lightParentEntity = mirror;
			let lightSceneEntity = await lightTemplate.instantiateTransientEntity(
			"Light",
			lightParentEntity,
			true
		);
		lightSceneEntity.setGlobalTransform({scale : [1, 1, 50]})
		let orientation = lightSceneEntity.getGlobalTransform().orientation;

		lightSceneEntity.setGlobalTransform({orientation : orientation});
		let position = lightSceneEntity.getGlobalTransform().position;
		position[1] += 0.5;
		lightSceneEntity.setGlobalTransform({position : position});
		ResizeBeam(mirror);
		focusedBeams.push(lightSceneEntity);
		}
	}

	async function stopMirror(mirror)
	{
		const children = await mirror.getChildren();

		// Vérifiez que l'élément à l'index 2 existe
		if (children.length > 0) {

			// Utilisez la méthode deleteEntities avec un tableau d'entités

			SDK3DVerse.engineAPI.deleteEntities([children[0]]);
			focusedBeams.shift();
		} else {
			console.error("L'élément à l'index 2 n'existe pas dans le tableau.");
		}
	}

	async function	createfocusedbeam(){

		const children = await perso.getChildren();

		if (children.length > 2)
			SDK3DVerse.engineAPI.deleteEntities([children[2]]);

		let lightParentEntity = perso;
		let lightSceneEntity = await lightTemplate.instantiateTransientEntity(
			"Light",
			lightParentEntity,
			true
		);
		focusedBeams.push(lightSceneEntity);
		isShooting = true;
	}

	async function destroyfocusedbeam() {

		const children = await perso.getChildren();

		// Vérifiez que l'élément à l'index 2 existe
		if (children.length > 2) {

			// Utilisez la méthode deleteEntities avec un tableau d'entités

			SDK3DVerse.engineAPI.deleteEntities([children[2]]);
			isShooting = false;
			focusedBeams.shift();
		} else {
			console.error("L'élément à l'index 2 n'existe pas dans le tableau.");
		}
	}

	async function movefocusedbeam() {

		const children = await perso.getChildren();

		if (isShooting === true && children[2]) {

			const cameraTransform = camera.getTransform();

			// dirVect
			let directionVector = [
				SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getWorldMatrix()[8],   // X
				SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getWorldMatrix()[9],   // Y
				SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getWorldMatrix()[10]   // Z
			];

			// Normalise le vecteur si nécessaire
			const magnitude = Math.sqrt(
				directionVector[0] ** 2 + directionVector[1] ** 2 + directionVector[2] ** 2
			);
			directionVector = [
				-directionVector[0] / magnitude,
				-directionVector[1] / magnitude,
				-directionVector[2] / magnitude
			];

			const origin = [
			cameraTransform.position[0] + directionVector[0], // Multiplie par la distance souhaitée
			cameraTransform.position[1] - 0.5,
			cameraTransform.position[2] + directionVector[2]
			];

			const rayLength = 100;
			const filterFlags = SDK3DVerse.PhysicsQueryFilterFlag.record_touches;
			// Returns dynamic body (if the ray hit one) in block, and all static bodies encountered along the way in touches

			const{ block, touches } = await SDK3DVerse.engineAPI.physicsRaycast(origin, directionVector, rayLength, filterFlags)

			// Vérifiez si la position Y de l'entité a changé
			const epsilon = 0.0001; // Tolerance
			if (Math.abs(children[2].getGlobalTransform().position[1] - cameraTransform.position[1]) > epsilon) {
			cameraTransform.position[1] -= 1;
			}
			// Calcule de la taille du rayon
			let FinalTransform = cameraTransform;
			// Vérifie s'il y a des touches
			while(touches && touches.length > 0 && (triggerBoxes.includes(touches[0].entity) || players.includes(touches[0].entity)))
			{
				touches.shift();
			}
			if (touches[0] && touches[0].entity && mirrors.includes(touches[0].entity))
			{
				let id = mirrors.findIndex(element => element === touches[0].entity);
				if (MirrorsShoot[id] == false)
					await shootMirror(touches[0].entity);
				touches.shift();
			}
			if (touches && touches.length > 0 && touches[0] && touches[0].position) {
				let distance = Math.sqrt(
					Math.pow(cameraTransform.position[0] - touches[0].position[0], 2) +
					Math.pow(cameraTransform.position[1] - touches[0].position[1], 2) +
					Math.pow(cameraTransform.position[2] - touches[0].position[2], 2)
				);
				FinalTransform.scale = [1, 1, distance];
			} else {
				// touches est undefined ou touches[0].position est undefined
				FinalTransform.scale = [1, 1, 100]; // ou une autre valeur par défaut
			}
				// Mettez à jour la transformée de l'entité
			children[2].setGlobalTransform(FinalTransform);
		}
	}

/*
---------------------------------------------------------------------------------------------
|																							|
|										Enemy												|
|																							|
---------------------------------------------------------------------------------------------
*/

	async function InitEnemy(enemyUUID){
		const enemyTemplate = new SDK3DVerse.EntityTemplate();
		enemyTemplate.attachComponent('mesh_ref', { value : enemyUUID });
		enemyTemplate.attachComponent('material_ref', { value : "bb8c7a41-ddfc-4a54-af44-a3f71f3cb484" });

		enemyTemplate.attachComponent('physics_material');

		const parentEntity = null;
		const deleteOnClientDisconnection = true;

		const enemyEntity = await enemyTemplate.instantiateTransientEntity(
			"enemy",
			parentEntity,
			deleteOnClientDisconnection
		);
		enemyEntity.setGlobalTransform({ position : [0, 1, 0] });
	
		let distance = 3 / 60;

		let enemyTransform = enemyEntity.getGlobalTransform();
		enemyTransform.scale = [0.7, 0.7, 0.7];

		let direction = 0;
		let height = 1;
		
		let directionTable = {
			0 : [0, 0, 1],
			1 : [1, 0, 0],
			2 : [0, 0, -1],
			3 : [-1, 0, 0]
		}
		/*
		 
		async function manageHeight(enemyPos, height){
			let offset = 0.02;

			let origin = enemyPos;
			let directionVector = [0, -1, 0];
			let rayLength = height;
			let filterFlags = SDK3DVerse.PhysicsQueryFilterFlag.dynamic_block | SDK3DVerse.PhysicsQueryFilterFlag.record_touches;
			
			let { block, touches } = await SDK3DVerse.engineAPI.physicsRaycast(origin, directionVector, rayLength, filterFlags)
			if (touches.length > 0)
			{
				while (touches.length > 0) {
					origin[1] += offset;
				}
			}
			else
			{
				while (touches.length <= 0) {
					origin[1] -= offset;
				}
			}
			let heightTransform = enemyEntity.getGlobalTransform();

		}
		*/

		async function wanderEnemy(){

			// X and Z Position Managment
			let enemyPos = enemyTransform.position;
			
			let directionVector = directionTable[direction]
			
			// Orientation Managment
			let angle = Math.atan2(directionVector[0], directionVector[2]);
			let a = 0,
				b = Math.sin(angle / 2),
				c = 0,
				d = Math.cos(angle / 2);
			let quaternion = [a, b, c, d];
			enemyTransform.orientation = quaternion;
			
			/*
			// Height Managment 
			let enemyHeight = manageHeight(enemyPos, height);
			*/

			// Setting New Enemy Position
			enemyPos = [
				enemyPos[0] + directionVector[0] * distance, // X
				1,											 // Y
				enemyPos[2] + directionVector[2] * distance  // Z
			]

			enemyTransform.position = enemyPos;
			enemyEntity.setGlobalTransform(enemyTransform);

			// Raycast
			let origin = enemyTransform.position;
	
			const rayLength = 3;
			const filterFlags = SDK3DVerse.PhysicsQueryFilterFlag.dynamic_block | SDK3DVerse.PhysicsQueryFilterFlag.record_touches;
	
			const{ block, touches } = await SDK3DVerse.engineAPI.physicsRaycast(origin, directionVector, rayLength, filterFlags)
			if (touches.length > 0)
			{
				const randomDirection = Math.floor(Math.random() * 3) + 1;
				direction = (direction + randomDirection) % 4;
			}
		}
		async function followEnemy(){

			let cameraTransform = camera.getTransform();
			let playerPos = cameraTransform.position;
			let enemyPos = enemyTransform.position;

			let directionVector = [
				playerPos[0] - enemyPos[0], // X
				playerPos[1] - enemyPos[1], // Y
				playerPos[2] - enemyPos[2]  // Z
			];

			let magnitude = Math.sqrt(directionVector[0]*directionVector[0] + directionVector[1]*directionVector[1] + directionVector[2]*directionVector[2])
			
			directionVector = [
				directionVector[0] / magnitude,
				directionVector[1] / magnitude,
				directionVector[2] / magnitude
			]

			let distanceRatio = directionVector[0] + directionVector[1] + directionVector[2]

			enemyTransform.position = [
				enemyPos[0] + directionVector[0] / distanceRatio * distance,
				enemyPos[1] + directionVector[1] / distanceRatio * distance,
				enemyPos[2] + directionVector[2] / distanceRatio * distance
			]
		}
		function boucle() {
			if (isBehavior) {
				wanderEnemy();
			} else {
				followEnemy();
				console.log("2");
			}
			setFPSCameraController(document.getElementById("display-canvas"));
			window.requestAnimationFrame(boucle);
		}
		window.requestAnimationFrame(boucle);
	}

	await InitEnemy(phantomMeshUUID);
	function changeBehavior(event) {
		if (event.key === 'p') { // Change behavior on pressing 'p' key
			isBehavior = !isBehavior; // Toggle behavior
		}
	}
	document.addEventListener('keypress', changeBehavior);


/*
---------------------------------------------------------------------------------------------
|																							|
|										Grab												|
|																							|
---------------------------------------------------------------------------------------------
*/

	async function InitGrabbable(){
		let cubes = await SDK3DVerse.engineAPI.findEntitiesByNames('cubeEntity');
		grabbable.push(...cubes);
	}

	InitGrabbable();

	document.addEventListener('keyup',(event)=>{
		if(event.key == 'f'){
			Grab();
			Interact();
		}
	})

	async function Interact(){

		const cameraTransform = camera.getTransform();
		let cubes = await SDK3DVerse.engineAPI.findEntitiesByNames('cubeEntity');

		// dirVect
		let directionVector = [
			SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getWorldMatrix()[8],   // X
			SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getWorldMatrix()[9],   // Y
			SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getWorldMatrix()[10]   // Z
		];

		// Normalise le vecteur si nécessaire
		const magnitude = Math.sqrt(
			directionVector[0] ** 2 + directionVector[1] ** 2 + directionVector[2] ** 2
		);
		directionVector = [
			-directionVector[0] / magnitude,
			-directionVector[1] / magnitude,
			-directionVector[2] / magnitude
		];

		const origin = [
		cameraTransform.position[0] + directionVector[0], // Multiplie par la distance souhaitée
		cameraTransform.position[1] + directionVector[1],
		cameraTransform.position[2] + directionVector[2]
		];

		const rayLength = 1;
		const filterFlags = SDK3DVerse.PhysicsQueryFilterFlag.record_touches;
		// Returns dynamic body (if the ray hit one) in block, and all static bodies encountered along the way in touches
		const{ block, touches } = await SDK3DVerse.engineAPI.physicsRaycast(origin, directionVector, rayLength, filterFlags);
		if (touches.length > 0)
			console.log(touches[0].entity);
		if (touches.length > 0 && buttons.includes(touches[0].entity))
		{
			console.log("test");
			cubes[0].setGlobalTransform({position : [0, 0, 0]});
		}
	}

	async function Grab(){
		if (isGrabbing == true)
		{
			grabbedEntity.attachComponent('rigid_body', ({'centerOfMass': [0.5,0.5,0.5]}));
			grabbedEntity = null;
			isGrabbing = false;
		}
		else if (isGrabbing == false)
		{

			const cameraTransform = camera.getTransform();

			// dirVect
			let directionVector = [
				SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getWorldMatrix()[8],   // X
				SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getWorldMatrix()[9],   // Y
				SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getWorldMatrix()[10]   // Z
			];

			// Normalise le vecteur si nécessaire
			const magnitude = Math.sqrt(
				directionVector[0] ** 2 + directionVector[1] ** 2 + directionVector[2] ** 2
			);
			directionVector = [
				-directionVector[0] / magnitude,
				-directionVector[1] / magnitude,
				-directionVector[2] / magnitude
			];

			const origin = [
			cameraTransform.position[0] + directionVector[0], // Multiplie par la distance souhaitée
			cameraTransform.position[1] + directionVector[1],
			cameraTransform.position[2] + directionVector[2]
			];

			const rayLength = 1;
			const filterFlags = SDK3DVerse.PhysicsQueryFilterFlag.dynamic_block | SDK3DVerse.PhysicsQueryFilterFlag.record_touches;
			// Returns dynamic body (if the ray hit one) in block, and all static bodies encountered along the way in touches
			const{ block, touches } = await SDK3DVerse.engineAPI.physicsRaycast(origin, directionVector, rayLength, filterFlags);

			if (block != null && grabbable.includes(block.entity))
			{
				grabbedEntity = (await block.entity);
				grabbedEntity.detachComponent('rigid_body');
				isGrabbing = true;
			}
		}
	}

	async function moveGrabbed(){
		const cameraTransform = camera.getTransform();

			// dirVect
			let directionVector = [
				SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getWorldMatrix()[8],   // X
				SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getWorldMatrix()[9],   // Y
				SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getWorldMatrix()[10]   // Z
			];

			// Normalise le vecteur si nécessaire
			const magnitude = Math.sqrt(
				directionVector[0] ** 2 + directionVector[1] ** 2 + directionVector[2] ** 2
			);
			directionVector = [
				-directionVector[0] / magnitude,
				-directionVector[1] / magnitude,
				-directionVector[2] / magnitude
			];

			const pos = [
				(cameraTransform.position[0] + directionVector[0] * 2.5) - 0.5, // Multiplie par la distance souhaitée
				(cameraTransform.position[1] + directionVector[1] * 2.5) - 0.5,
				(cameraTransform.position[2] + directionVector[2] * 2.5) - 0.5
			];

			grabbedEntity.setGlobalTransform({position : pos});
	}

/*
---------------------------------------------------------------------------------------------
|                                                                                            |
|                                        Mirror                                                |
|                                                                                            |
---------------------------------------------------------------------------------------------
*/
	let angle = 0;
	let rad = 0;
	function degToRad(deg){ return deg * Math.PI/180}

	document.addEventListener('keyup',(event)=>{
		if(event.key == 'r'){
			rotateMirror();
		}
	})

	async function rotateMirror(){
		const cameraTransform = camera.getTransform();

		// dirVect
		let directionVector = [
			SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getWorldMatrix()[8],   // X
			SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getWorldMatrix()[9],   // Y
			SDK3DVerse.engineAPI.cameraAPI.getActiveViewports()[0].getWorldMatrix()[10]   // Z
		];

		// Normalise le vecteur si nécessaire
		const magnitude = Math.sqrt(
			directionVector[0] ** 2 + directionVector[1] ** 2 + directionVector[2] ** 2
		);
		directionVector = [
			-directionVector[0] / magnitude,
			-directionVector[1] / magnitude,
			-directionVector[2] / magnitude
		];

		const origin = [
		cameraTransform.position[0] + directionVector[0], // Multiplie par la distance souhaitée
		cameraTransform.position[1] + directionVector[1],
		cameraTransform.position[2] + directionVector[2]
		];

		const rayLength = 1;
		const filterFlags = SDK3DVerse.PhysicsQueryFilterFlag.dynamic_block | SDK3DVerse.PhysicsQueryFilterFlag.record_touches;
		// Returns dynamic body (if the ray hit one) in block, and all static bodies encountered along the way in touches
		const{ block, touches } = await SDK3DVerse.engineAPI.physicsRaycast(origin, directionVector, rayLength, filterFlags);
		if (block != null){
			if (block.entity.getName() == 'mirror'){
				let transform = block.entity.getGlobalTransform();
				angle += 45;
				rad  = degToRad(angle);
				transform.orientation = [0,Math.sin((rad/2)),0,Math.cos((rad/2))];
				block.entity.setGlobalTransform(transform);
				let index = mirrors.findIndex(element => element === block.entity);
				if (MirrorsShoot[index] == true)
					ResizeBeam(block.entity);
			}
		}
	}

/*
---------------------------------------------------------------------------------------------
|																							|
|									Cinematic												|
|																							|
---------------------------------------------------------------------------------------------
*/

	async function PlayCinematic(){
		//let transform = camera.getTransform();
		//await SDK3DVerse.engineAPI.cameraAPI.travel(camera, [-3.007635, 5.210598, 68.501045], camera.getTransform().orientation, 1, camera.getTransform().position, camera.getTransform().orientation);
		//camera.setTransform(transform);
	}

/*
//-------------------------------------------------------------------------------------------------------------------------------------------------------
|																																						|
|																																						|
|							---------------------------------------------------------------------------------------------								|
|							|																							|								|
|							|										Game Loop											|								|
|							|																							|								|
|							---------------------------------------------------------------------------------------------								|
|																																						|
|																																						|
//-------------------------------------------------------------------------------------------------------------------------------------------------------
*/

	function loop() {
		movefocusedbeam();
		if (isGrabbing)
			moveGrabbed();
		window.requestAnimationFrame(loop);
	}
	window.requestAnimationFrame(loop);
}