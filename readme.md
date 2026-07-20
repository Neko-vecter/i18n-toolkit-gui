# i18n toolkit GUI

> [!important]
> This project current in dev. Actions workflows will be introduced once the project reaches a stable state.
>
> Refer to the [build instructions](#build) below to build from source. 

## what is this project?

This project is a electron GUI for i18n workflow.

## UI

<img src="./img/launch-ui.png" width="100%">
<img src="./img/edit-ui.png" width="100%">

## Dev

> [!important]
> This project is using yarn v4 `yarn@4.17.1`

Install Corepack

```shell
npm install -g corepack
corepack enable
```

Install Dependency

```shell
yarn install
```

```shell
yarn dev
```

## Build

> [!important]
> This project is using yarn v4 `yarn@4.17.1`

Install Corepack

```shell
npm install -g corepack
corepack enable
```

Install Dependency

```shell
yarn install
```

### Windows

build to dir

```shell
yarn release:win:dir
```

build to zip

```shell
yarn release:win:zip
```
