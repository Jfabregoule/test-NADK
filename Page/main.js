//------------------------------------------------------------------------------
import {
	publicToken,
	mainSceneUUID,
	characterControllerSceneUUID,
} from "./config.js";

//------------------------------------------------------------------------------
window.addEventListener("load", InitApp);

//------------------------------------------------------------------------------
async function InitApp() {
	const engineOutputEventUUID = "12f6542a-5405-4e7d-bce1-639c695dfdd4";
	SDK3DVerse.engineAPI.registerToEvent(engineOutputEventUUID, "log", (event) => console.log(event.dataObject.output));

	await SDK3DVerse.joinOrStartSession({
		userToken: publicToken,
		sceneUUID: mainSceneUUID,
		canvas: document.getElementById("display-canvas"),
		connectToEditor: true,
		startSimulation: "on-assets-loaded",
	});

	await InitFirstPersonController(characterControllerSceneUUID);
}


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
	const playerTemplate = new SDK3DVerse.EntityTemplate();
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

	const perso = await SDK3DVerse.engineAPI.findEntitiesByNames('Player');
	window.addEventListener("keydown", actions);

	// document.addEventListener('keyup', event => {
	// 	if (event.code === 'Space') {
	// 		//var pos = firstPersonController.getGlobalTransform();
	// 		console.log("jump")
	// 	}
	// })

	SDK3DVerse.actionMap.values["JUMP"] = [["KEY_32"]];
	SDK3DVerse.actionMap.propagate();

	function actions() {
		setFPSCameraController(document.getElementById("display-canvas"));
	}
}