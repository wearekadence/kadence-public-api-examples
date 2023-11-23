# Kadence - Public API - Examples
This repository contains examples of how to build on and use the Kadence public API. This repository is meant
to be used as a reference for developers who are looking to build on the Kadence public API.

The sample application(s) in this repository utilises the following technologies:

- [Node.js](https://nodejs.org/en/)
- [Express](https://expressjs.com/)
- [Axios HTTP](https://axios-http.com/)
- [Bootstrap](https://getbootstrap.com/)
- [Highcharts](https://www.highcharts.com/)
- [Tabulator](http://tabulator.info/)

We've deliberatly kept the sample application(s) as simple as possible to make it easier to understand the code. That's
why this is written in pure JavaScript and not utilising any frameworks like Angular, React or Vue. You shouldn't need
to be an expert in any of these technologies to understand the code.

## Getting Started

To get started, you'll need to have Node.js installed on your machine. You can download Node.js from
[here](https://nodejs.org/en/). Once you have Node.js installed, you can clone this repository and install the
dependencies by running the following commands:

```shell
git clone git@github.com:wearekadence/kadence-public-api-examples.git
```
or if you prefer to use HTTPS:
```shell
git clone https://github.com/wearekadence/kadence-public-api-examples.git
```

Once you've cloned the repository, you can install the dependencies by running the following command:

```shell
cd kadence-public-api-examples
npm install
```

## Running the application

Before you can run the application, you'll need to set the following environment variables:

| Variable | Description                     |
| --- |---------------------------------|
| `KADENCE_API_KEY_IDENTIFIER` | Your Kadence API key identifier |
| `KADENCE_API_KEY_SECRET` | Your Kadence API key secret     |

i.e. on Linux or macOS:
```shell
export KADENCE_API_KEY=your-api-key
export KADENCE_API_SECRET=your-api-secret
```

or on Windows:
```shell
set KADENCE_API_KEY=your-api-key
set KADENCE_API_SECRET=your-api-secret
```

To set up an API key and secret, you can consult the following help article: [How To Create an API Key?](https://help.kadence.co/kb/guide/en/how-to-create-an-api-key-Wzt5dE1Kbe/Steps/2372427)

To start the application, run the following command:
```shell
npm start
```

You should now be able to access the application at [http://localhost:3000](http://localhost:3000) (or whatever port is next available sequentially).
You'll see output in the terminal window that looks like this:

```shell
> kadence-public-api-examples@1.0.0 start
> node index.js

Kadence - Public API Examples - Running on port 3000
http://localhost:3000
```