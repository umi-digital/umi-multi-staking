// envUtils

const envUtils = {
  isMainnet: function(network) {
    return network === 'mainnet';
  }
}

module.exports = {
  isMainnet: envUtils.isMainnet,
}