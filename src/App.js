import React, { useState } from 'react';

import './App.css';
import Amplify, { Storage, Predictions } from 'aws-amplify';
import { AmazonAIPredictionsProvider } from '@aws-amplify/predictions';

//import awsconfig from './aws-exports';

import mic from 'microphone-stream';

Amplify.configure({
  "aws_project_region": "us-east-1",
    "aws_cognito_identity_pool_id": "us-east-1:7c520420-a043-4835-9e28-b602ebe8fae3",
    "aws_cognito_region": "us-east-1",
    "aws_user_pools_id": "us-east-1_K7RirN5w3",
    "aws_user_pools_web_client_id": "3msid5aii51fb47b8si1o32hj1",
    "oauth": {},
    "predictions": {
        "convert": {
            "translateText": {
                "region": "us-east-1",
                "proxy": false,
                "defaults": {
                    "sourceLanguage": "en",
                    "targetLanguage": "es"
                }
            },
            "speechGenerator": {
                "region": "us-east-1",
                "proxy": false,
                "defaults": {
                    "VoiceId": "Penelope",
                    "LanguageCode": "es-US"
                }
            }
        },
        "interpret": {
            "interpretText": {
                "region": "us-east-1",
                "proxy": false,
                "defaults": {
                    "type": "SENTIMENT"
                }
            }
        }
    }
});
Amplify.addPluggable(new AmazonAIPredictionsProvider());

function TextIdentification() {
  const [response, setResponse] = useState("You can add a photo by uploading directly from the app ")

  function identifyFromFile(event) {
    setResponse('identifying text...');
    const { target: { files } } = event;
    const [file,] = files || [];

    if (!file) {
      return;
    }
    Predictions.identify({
      text: {
        source: {
          file,
        },
        format: "PLAIN", // Available options "PLAIN", "FORM", "TABLE", "ALL"
      }
    }).then(({text: { fullText }}) => {
      setResponse(fullText)
    })
      .catch(err => setResponse(JSON.stringify(err, null, 2)))
  }

  return (
    <div className="Text">
      <div>
        <h3>Text identification</h3>
        <input type="file" onChange={identifyFromFile}></input>
        <p>{response}</p>
      </div>
    </div>
  );
}

function EntityIdentification() {
  const [response, setResponse] = useState("Click upload for test ")
  const [src, setSrc] = useState("");

  function identifyFromFile(event) {
    setResponse('searching...');

    const { target: { files } } = event;
    const [file,] = files || [];

    if (!file) {
      return;
    }
    Predictions.identify({
      entities: {
        source: {
          file,
        },
        /**For using the Identify Entities advanced features, enable collection:true and comment out celebrityDetection
         * Then after you upload a face with PredictionsUpload you'll be able to run this again
         * and it will tell you if the photo you're testing is in that Collection or not and display it*/
        //collection: true
        celebrityDetection: true
      }
    }).then(result => {
      console.log(result);
      const entities = result.entities;
      let imageId = ""
      let names = ""
      entities.forEach(({ boundingBox, metadata: { name = "", externalImageId = "" } }) => {
        const {
          width, // ratio of overall image width
          height, // ratio of overall image height
          left, // left coordinate as a ratio of overall image width
          top // top coordinate as a ratio of overall image height
        } = boundingBox;
        imageId = externalImageId;
        if (name) {
          names += name + " .";
        }
        console.log({ name });
      })
      if (imageId) {
        Storage.get("", {
          customPrefix: {
            public: imageId
          },
          level: "public",
        }).then(setSrc); // this should be better but it works
      }
      console.log({ entities });
      setResponse(names);
    })
      .catch(err => console.log(err))
  }

  return (
    <div className="Text">
      <div>
        <h3>Entity identification</h3>
        <input type="file" onChange={identifyFromFile}></input>
        <p>{response}</p>
        { src && <img src={src}></img>}
      </div>
    </div>
  );
}

function PredictionsUpload() {
  /* This is Identify Entities Advanced feature
   * This will upload user images to the appropriate bucket prefix
   * and a Lambda trigger will automatically perform indexing
   */
  function upload(event) {
    const { target: { files } } = event;
    const [file,] = files || [];
    Storage.put(file.name, file, {
      level: 'protected',
      customPrefix: {
        protected: 'protected/predictions/index-faces/',
      }
    });
  }

  return (
    <div className="Text">
      <div>
        <h3>Upload to predictions s3</h3>
        <input type="file" onChange={upload}></input>
      </div>
    </div>
  );
}

function LabelsIdentification() {
  const [response, setResponse] = useState("Click upload for test ")

  function identifyFromFile(event) {
    const { target: { files } } = event;
    const [file,] = files || [];

    if (!file) {
      return;
    }
    Predictions.identify({
      labels: {
        source: {
          file,
        },
        type: "ALL" // "LABELS" will detect objects , "UNSAFE" will detect if content is not safe, "ALL" will do both default on aws-exports.js
      }
    }).then(result => setResponse(JSON.stringify(result, null, 2)))
      .catch(err => setResponse(JSON.stringify(err, null, 2)))
  }

  return (
    <div className="Text">
      <div>
        <h3>Labels identification</h3>
        <input type="file" onChange={identifyFromFile}></input>
        <p>{response}</p>
      </div>
    </div>
  );
}

function SpeechToText(props) {
  const [response, setResponse] = useState("Press 'start recording' to begin your transcription. Press STOP recording once you finish speaking.")

  function AudioRecorder(props) {
    const [recording, setRecording] = useState(false);
    const [micStream, setMicStream] = useState();
    const [audioBuffer] = useState(
      (function() {
        let buffer = [];
        function add(raw) {
          buffer = buffer.concat(...raw);
          return buffer;
        }
        function newBuffer() {
          console.log("resetting buffer");
          buffer = [];
        }

        return {
          reset: function() {
            newBuffer();
          },
          addData: function(raw) {
            return add(raw);
          },
          getData: function() {
            return buffer;
          }
        };
      })()
    );

    async function startRecording() {
      console.log('start recording');
      audioBuffer.reset();

      window.navigator.mediaDevices.getUserMedia({ video: false, audio: true }).then((stream) => {
        const startMic = new mic();

        startMic.setStream(stream);
        startMic.on('data', (chunk) => {
          var raw = mic.toRaw(chunk);
          if (raw == null) {
            return;
          }
          audioBuffer.addData(raw);

        });

        setRecording(true);
        setMicStream(startMic);
      });
    }

    async function stopRecording() {
      console.log('stop recording');
      const { finishRecording } = props;

      micStream.stop();
      setMicStream(null);
      setRecording(false);

      const resultBuffer = audioBuffer.getData();

      if (typeof finishRecording === "function") {
        finishRecording(resultBuffer);
      }

    }

    return (
      <div className="audioRecorder">
        <div>
          {recording && <button onClick={stopRecording}>Stop recording</button>}
          {!recording && <button onClick={startRecording}>Start recording</button>}
        </div>
      </div>
    );
  }

  function convertFromBuffer(bytes) {
    setResponse('Converting text...');

    Predictions.convert({
      transcription: {
        source: {
          bytes
        },
        // language: "en-US", // other options are "en-GB", "fr-FR", "fr-CA", "es-US"
      },
    }).then(({ transcription: { fullText } }) => setResponse(fullText))
      .catch(err => setResponse(JSON.stringify(err, null, 2)))
  }

  return (
    <div className="Text">
      <div>
        <h3>Speech to text</h3>
        <AudioRecorder finishRecording={convertFromBuffer} />
        <p>{response}</p>
      </div>
    </div>
  );
}

function TextToSpeech() {
  const [response, setResponse] = useState("...")
  const [textToGenerateSpeech, setTextToGenerateSpeech] = useState("write to speech");

  function generateTextToSpeech() {
    setResponse('Generating audio...');
    Predictions.convert({
      textToSpeech: {
        source: {
          text: textToGenerateSpeech,
        },
        voiceId: "Amy" // default configured on aws-exports.js 
        // list of different options are here https://docs.aws.amazon.com/polly/latest/dg/voicelist.html
      }
    }).then(result => {
      let AudioContext = window.AudioContext || window.webkitAudioContext;
      console.log({ AudioContext });
      const audioCtx = new AudioContext(); 
      const source = audioCtx.createBufferSource();
      audioCtx.decodeAudioData(result.audioStream, (buffer) => {

        source.buffer = buffer;
        source.connect(audioCtx.destination);
        source.start(0);
      }, (err) => console.log({err}));

      setResponse(`Generation completed, press play`);
    })
      .catch(err => setResponse(err))
  }

  function setText(event) {
    setTextToGenerateSpeech(event.target.value);
  }

  return (
    <div className="Text">
      <div>
        <h3>Text To Speech</h3>
        <input value={textToGenerateSpeech} onChange={setText}></input>
        <button onClick={generateTextToSpeech}>Text to Speech</button>
        <h3>{response}</h3>
      </div>
    </div>
  );
}

function TextTranslation() {
  const [response, setResponse] = useState(" ")
  const [responseAr, setResponseAr] = useState(" ")
  const [textToTranslate, setTextToTranslate] = useState("write to translate");

  function translate() {
    Predictions.convert({
      translateText: {
        source: {
          text: textToTranslate,
          // language : "es" // defaults configured on aws-exports.js
          // supported languages https://docs.aws.amazon.com/translate/latest/dg/how-it-works.html#how-it-works-language-codes
        },
        // targetLanguage: "en"
      }
    }).then(result => setResponse(JSON.stringify(result, null, 2)))
      .catch(err => setResponse(JSON.stringify(err, null, 2)))

    Predictions.convert({
        translateText: {
          source: {
            text: textToTranslate,
            // language : "es" // defaults configured on aws-exports.js
            // supported languages https://docs.aws.amazon.com/translate/latest/dg/how-it-works.html#how-it-works-language-codes
          },
           targetLanguage: "ar"
        }
      }).then(result => setResponseAr(JSON.stringify(result, null, 2)))
        .catch(err => setResponseAr(JSON.stringify(err, null, 2)))
    
  }

  function setText(event) {
    setTextToTranslate(event.target.value);
  }

  return (
    <div className="Text">
      <div>
        <h3>Text Translation</h3>
        <input value={textToTranslate} onChange={setText}></input>
        <button onClick={translate}>Translate</button>
        <p>{response}</p>
        <p>{responseAr}</p>
      </div>
    </div>
  );
}

function TextInterpretation() {
  const [response, setResponse] = useState("Input some text and click enter to test")
  const [textToInterpret, setTextToInterpret] = useState("write some text here to interpret");

  function interpretFromPredictions() {
    Predictions.interpret({
      text: {
        source: {
          text: textToInterpret,
        },
        type: "ALL"
      }
    }).then(result => setResponse(JSON.stringify(result.textInterpretation.sentiment.predominant, null, 2)))
      .catch(err => setResponse(JSON.stringify(err, null, 2)))
  }

  function setText(event) {
    setTextToInterpret(event.target.value);
  }

  return (
    <div className="Text">
      <div>
        <h3>Text interpretation</h3>
        <input value={textToInterpret} onChange={setText}></input>
        <button onClick={interpretFromPredictions}>test</button>
        <p>{response}</p>
      </div>
    </div>
  );
}

function App() {
  return (
    <div className="App">
      Translate Text
      <TextTranslation />
      <br/>
      Speech Generation
      <TextToSpeech />
      <br/>
      Transcribe Audio
      <SpeechToText />
      <br/>
      Identify Text
      <TextIdentification />
      <br/>
      Identify Entities
      <EntityIdentification />
      <br/>
      Identify Entities (Advanced)
      <PredictionsUpload />
      <br/>
      Label Objects
      <LabelsIdentification />
      <br/>
      Text Interpretation
      <TextInterpretation />
    </div>
  );
}

export default App;