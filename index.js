import { GoogleGenerativeAI } from '@google/generative-ai'
import { exec } from 'node:child_process'
import fs from 'node:fs'

// Tools

async function execCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, function (err, stdout, stderr) {
            if (err) {
                return reject(err);
            }

            resolve(`stdout: ${stdout}\nstderr:${stderr}`)
        })
    })
}

function writeInFile(fileName, data) {
    fs.writeFile(fileName, data, err => {
        if (err) {
            console.error(err);
        }
    })
}


function extractFirstJSON(str) {
    const match = str.match(/\{[\s\S]*?\}/);
    if (!match) throw new Error("No valid JSON found");
    return JSON.parse(match[0]);
}

const TOOLS_MAP = {
    execCommand: execCommand,
    writeInFile: writeInFile
}


const genAI = new GoogleGenerativeAI("GEMINI-API-KEY");

const SYSTEM_PROMPT = `
You are an help full ai assistant that helps to solve user query.
You work in this format START , THINK , ACTION , OBSERVE and OUTPUT.
You perform only one step at a time, and wait for the next step.

In start phase , user gives query to you.
You THINK on it 2-3 times so that you meets user need.
If there is need to call a tool , you call ACTION event with appropriate tool and input.
If it is an ACTION call wait for OBSERVE that is the output of that tool.
Based on the OBSERVE you either give the output or loop again

Rules:
- Always wait for next step.
- Always output a single step and wait for the next step.
- Output must be strictly JSON
- Only call tool action from
- Strictly follow the output format in JSON
- For writing code to files, ALWAYS use proper syntax and **Windows-compatible commands**.

- Windows Writing Rules:
    - Use mkdir to make directories

Available Tools:
- execCommand(command: String): String Executes a given windows command on user device and returns the STDOUT
- writeInFile(fileName : String , data : String) Writes 'data' to give file 'fileName' with full path

Example:
START: Create index.js file?
THINK: User wants to create index.js file.
THINK: To create file i need to execute command touch.
THINK: From available tools, I must call execCommand with input command 'touch index.js'.
ACTION: Call Tool execCommand(touch index.js).
OUTPUT: index.js created successfully.

Output Example:
{"role":"user" , "content":"Create index.js file and add data into it."}
{"step":"think" , "content":"User wants to create index.js file."}
{"step":"think" , "content":"To create file i need to execute command touch."}
{"step":"think" , "content":"From available tools, I must call execCommand with input command 'touch index.js'."}
{"step":"action" ,"tool":"execCommand","input":"touch index.js"}
{"step":"observe","content":"index.js created"}
{"step":"think","content":"User also wants to add data into that file"}
{"step":"think","content":"From available tools , I must call writeInFile function"}
{"step":"action" ,"tool":"writeInFile","fileName":"folder/index.js" , "data":"Hello world"}
{"step":"observe","content":"Data added successfully"}
{"step":"output" ,"content":"index.js created successfully and data is also added into it."}

Output Format:
{"step":"string","tool":"string","input":"string" , "content" : "string"}

Note:
- Always output a single step and wait for the next step.
- The user is on a Windows system, so prefer using Windows-compatible commands like 'type' instead of cat'.
- Give codes in proper syntax for required language.
- Never include invalid syntax like sum = + b or missing semicolons
- Always close all brackets and functions properly

Important-
    - Always wait for next step.
    - Use writeInFile function to write into any file
`

const userQuery = `I am wanting to make calculator application using html ,css and js . It should perform basic arithmatic operations , there should be complete logic in it give all this in Calculator folder also make it UI good`;

const messages = [
    {
        role: "user",
        parts: [
            {
                text: `${SYSTEM_PROMPT}\n\nQuery: ${userQuery}`
            }
        ]
    }
];


async function runAgent(userQuery) {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const chat = model.startChat({ history: messages });

    while (true) {
        try {

            const req = await chat.sendMessage("Continue");
            const reply = req.response.text().trim();

            console.log("🤖 Gemini Decided:", reply);

            const cleaned = reply
                .replace(/```json/g, '')   // Remove ```json
                .replace(/```/g, '')       // Remove ```
                .trim();

            // console.log('Cleaned - ',cleaned);
            // const parsedRes = extractFirstJSON(cleaned);
            // console.log('parsed - ',parsedRes)

            const parsedRes = JSON.parse(cleaned);

            messages.push({
                role: "model",
                parts: [
                    {
                        text: JSON.stringify(parsedRes)
                    }
                ]
            })

            if (parsedRes.step && parsedRes.step === 'think') {
                continue;
            }

            if (parsedRes.step && parsedRes.step === 'output') {
                break;
            }

            if (parsedRes.step && parsedRes.step === 'action') {
                const tool = parsedRes.tool;

                if (tool === 'execCommand') {

                    const input = parsedRes.input;
                    console.log(`Tool -> ${tool} : ${input}`)

                    const value = await TOOLS_MAP[tool](input)

                    messages.push({
                        role: "model",
                        parts: [{
                            text: JSON.stringify({ step: 'observe', content: value })
                        }]
                    })
                }
                if (tool === 'writeInFile') {
                    const filePath = parsedRes.fileName;
                    const data = parsedRes.data;

                    TOOLS_MAP[tool](filePath, data);

                    messages.push({
                        role: "model",
                        parts: [{
                            text: JSON.stringify({ step: 'observe', content: `Data written into ${filePath}` })
                        }]
                    })
                }

                continue;
            }



        } catch (error) {
            console.log("Error : ", error);
        }
    }
}

runAgent(userQuery);

