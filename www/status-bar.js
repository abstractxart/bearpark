// Set BEARpark purple status bar
document.addEventListener('deviceready', function() {
  if (window.StatusBar) {
    // Set to BEARpark purple
    StatusBar.backgroundColorByHexString('#6B1FA8');
    StatusBar.styleLightContent(); // White text/icons
  }
}, false);
