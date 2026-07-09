module.exports = {
  render({ url }) {
    return `
      <div id="app">
        <h1>Hello SSR!</h1>
        <p>Current path: ${url}</p>
        <p>This content was rendered on the server side.</p>
      </div>
    `.trim();
  }
};
