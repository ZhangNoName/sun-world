from .adapters import reviewed_connectors
from .schemas import IntegrationConnector


class IntegrationRegistry:
    """Build-time reviewed connector registry.

    Connections and credentials may become runtime-configurable later, but code
    adapters are deliberately installed at build time instead of downloaded by
    the API process.
    """

    def __init__(self, connectors: list[IntegrationConnector] | None = None):
        values = connectors if connectors is not None else reviewed_connectors()
        self._connectors = {connector.adapter_id: connector for connector in values}
        if len(self._connectors) != len(values):
            raise ValueError("Integration adapter IDs must be unique")

    def list_connectors(self) -> list[IntegrationConnector]:
        return sorted(self._connectors.values(), key=lambda item: item.adapter_id)

    def get_connector(self, adapter_id: str) -> IntegrationConnector | None:
        return self._connectors.get(adapter_id)
integration_registry = IntegrationRegistry()
