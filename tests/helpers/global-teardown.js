module.exports = async () => {
  console.log('[Global Teardown] E2E test suite completed');
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('[Global Teardown] Cleanup complete');
};
