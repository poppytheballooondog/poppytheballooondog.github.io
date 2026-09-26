"use strict";


const talkButton =
    document.getElementById(
        "talk"
    );

const stopButton =
    document.getElementById(
        "stop"
    );

const statusElement =
    document.getElementById(
        "status"
    );

const conversationElement =
    document.getElementById(
        "conversation"
    );

const errorElement =
    document.getElementById(
        "error"
    );


let peerConnection = null;

let dataChannel = null;

let microphoneStream = null;

let audioElement = null;

let connected = false;


function status(text) {

    statusElement.textContent =
        text;

}


function error(text) {

    console.error(text);

    errorElement.hidden =
        false;

    errorElement.textContent =
        text;

}


function clearError() {

    errorElement.hidden =
        true;

    errorElement.textContent =
        "";

}


function showConversation(text) {

    conversationElement.textContent =
        text;

}


/*
==========================================================
 GET TEMPORARY REALTIME CREDENTIAL
==========================================================
*/

async function getClientSecret() {

    const response =
        await fetch(
            "/api/realtime-session"
        );


    const data =
        await response.json();


    if (!response.ok) {

        throw new Error(
            data?.error?.message ||
            data?.error ||
            "Could not create Realtime session."
        );

    }


    /*
       OpenAI's temporary credential is returned
       by the client-secret endpoint.
    */

    const secret =
        data?.value ||
        data?.client_secret?.value;


    if (!secret) {

        console.error(
            "Unexpected client secret response:",
            data
        );

        throw new Error(
            "OpenAI did not return a temporary client secret."
        );

    }


    return secret;

}


/*
==========================================================
 CONNECT TO REALTIME
==========================================================
*/

async function connectPoppy() {

    clearError();

    status(
        "Connecting to Poppy... 🎈"
    );


    const clientSecret =
        await getClientSecret();


    /*
       Create WebRTC peer connection.
    */

    peerConnection =
        new RTCPeerConnection();


    /*
       Audio produced by OpenAI.
    */

    audioElement =
        document.createElement(
            "audio"
        );

    audioElement.autoplay =
        true;


    audioElement.playsInline =
        true;


    audioElement.style.display =
        "none";


    document.body.appendChild(
        audioElement
    );


    peerConnection.ontrack =
        event => {

            const stream =
                event.streams[0];


            audioElement.srcObject =
                stream;


            audioElement
                .play()
                .catch(
                    console.error
                );

        };


    /*
       Get microphone.
    */

    microphoneStream =
        await navigator.mediaDevices
            .getUserMedia(
                {
                    audio: true
                }
            );


    /*
       Add microphone to WebRTC.
    */

    for (
        const track
        of microphoneStream.getTracks()
    ) {

        peerConnection.addTrack(
            track,
            microphoneStream
        );

    }


    /*
       Data channel carries Realtime events.
    */

    dataChannel =
        peerConnection.createDataChannel(
            "oai-events"
        );


    dataChannel.onopen =
        () => {

            console.log(
                "Realtime data channel opened."
            );


            /*
               Ask Poppy to start the conversation
               with the exact opening behavior from
               your character configuration.
            */

            sendEvent({

                type:
                    "response.create"

            });

        };


    dataChannel.onmessage =
        event => {

            try {

                const message =
                    JSON.parse(
                        event.data
                    );


                handleRealtimeEvent(
                    message
                );

            }
            catch (err) {

                console.error(
                    "Realtime event error:",
                    err
                );

            }

        };


    dataChannel.onerror =
        event => {

            console.error(
                "Data channel error:",
                event
            );

            error(
                "Poppy's realtime connection encountered an error."
            );

        };


    /*
       Create SDP offer.
    */

    const offer =
        await peerConnection
            .createOffer();


    await peerConnection
        .setLocalDescription(
            offer
        );


    /*
       Send SDP to OpenAI Realtime.
    */

    const sdpResponse =
        await fetch(
            "https://api.openai.com/v1/realtime/calls",
            {

                method:
                    "POST",

                headers: {

                    "Authorization":
                        `Bearer ${clientSecret}`,

                    "Content-Type":
                        "application/sdp"

                },

                body:
                    offer.sdp

            }
        );


    if (!sdpResponse.ok) {

        const text =
            await sdpResponse.text();


        throw new Error(
            "Realtime connection failed: " +
            text
        );

    }


    const answer =
        await sdpResponse.text();


    await peerConnection
        .setRemoteDescription(
            {
                type:
                    "answer",

                sdp:
                    answer
            }
        );


    connected =
        true;


    talkButton.disabled =
        true;

    stopButton.disabled =
        false;


    status(
        "Poppy is ready! 🎈"
    );

}


/*
==========================================================
 SEND REALTIME EVENT
==========================================================
*/

function sendEvent(event) {

    if (
        !dataChannel ||
        dataChannel.readyState !==
            "open"
    ) {

        console.warn(
            "Realtime data channel isn't open."
        );

        return;

    }


    dataChannel.send(
        JSON.stringify(
            event
        )
    );

}


/*
==========================================================
 REALTIME EVENTS
==========================================================
*/

function handleRealtimeEvent(
    event
) {

    console.log(
        "Realtime:",
        event
    );


    switch (
        event.type
    ) {

        case "session.created":

            status(
                "Poppy connected! 🎈"
            );

            break;


        case "input_audio_buffer.speech_started":

            status(
                "Poppy is listening... 🎤"
            );

            break;


        case "input_audio_buffer.speech_stopped":

            status(
                "Poppy is thinking... 🧠"
            );

            break;


        case "response.created":

            status(
                "Poppy is responding... 🎈"
            );

            break;


        case "response.audio_transcript.delta":

            /*
               OpenAI's generated voice transcript
               arrives incrementally.
            */

            if (
                event.delta
            ) {

                conversationElement.textContent +=
                    event.delta;

            }

            break;


        case "response.audio_transcript.done":

            status(
                "Poppy is talking! 🔊"
            );

            break;


        case "response.done":

            status(
                "Poppy is ready! 🎤"
            );

            break;


        case "error":

            console.error(
                "Realtime API error:",
                event
            );


            error(
                event.error?.message ||
                "Realtime API error."
            );

            status(
                "Poppy encountered an error."
            );

            break;

    }

}


/*
==========================================================
 DISCONNECT
==========================================================
*/

function disconnectPoppy() {

    connected =
        false;


    if (microphoneStream) {

        for (
            const track
            of microphoneStream.getTracks()
        ) {

            track.stop();

        }

    }


    microphoneStream =
        null;


    if (dataChannel) {

        try {

            dataChannel.close();

        }
        catch {}

    }


    dataChannel =
        null;


    if (peerConnection) {

        try {

            peerConnection.close();

        }
        catch {}

    }


    peerConnection =
        null;


    if (audioElement) {

        audioElement.srcObject =
            null;

        audioElement.remove();

    }


    audioElement =
        null;


    talkButton.disabled =
        false;

    stopButton.disabled =
        true;


    status(
        "Poppy stopped. 🎈"
    );

}


/*
==========================================================
 BUTTONS
==========================================================
*/

talkButton.addEventListener(
    "click",
    async () => {

        try {

            await connectPoppy();

        }
        catch (err) {

            console.error(
                err
            );

            error(
                err.message
            );

            disconnectPoppy();

        }

    }
);


stopButton.addEventListener(
    "click",
    disconnectPoppy
);