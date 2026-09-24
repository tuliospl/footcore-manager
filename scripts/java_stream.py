"""Read Java serialization as plain data; never load classes or execute readObject.

Protocol: https://docs.oracle.com/en/java/javase/25/docs/specs/serialization/protocol.html
Only the stream constructs needed by the supplied M26 files are supported.
"""
import struct


class JavaStream:
    def __init__(self, data):
        if len(data) > 8 * 1024 * 1024:
            raise ValueError("Arquivo maior que 8 MB")
        self.data = data
        self.offset = 0
        self.handles = []
        self.depth = 0
        if self.take(4) != b"\xac\xed\x00\x05":
            raise ValueError("Cabeçalho Java inválido")

    def take(self, size):
        if size < 0 or self.offset + size > len(self.data):
            raise ValueError(f"Dados incompletos na posição {self.offset}")
        result = self.data[self.offset:self.offset + size]
        self.offset += size
        return result

    def number(self, code):
        return struct.unpack(">" + code, self.take(struct.calcsize(">" + code)))[0]

    def utf(self, long=False):
        raw = self.take(self.number("q" if long else "H"))
        # Java modified UTF-8 encodes NUL as C0 80 and supplementary chars as
        # surrogate pairs. Convert those pairs after decoding the code units.
        return raw.replace(b"\xc0\x80", b"\x00").decode("utf-8", "surrogatepass").encode("utf-16", "surrogatepass").decode("utf-16")

    def register(self, value):
        if len(self.handles) >= 100000:
            raise ValueError("Excesso de objetos")
        self.handles.append(value)
        return value

    def annotations(self):
        values = []
        while self.offset < len(self.data) and self.data[self.offset] != 0x78:
            values.append(self.read())
        if self.take(1) != b"\x78":
            raise ValueError("Bloco sem fechamento")
        return values

    def primitive(self, code):
        formats = {"B": "b", "C": "H", "D": "d", "F": "f", "I": "i", "J": "q", "S": "h", "Z": "?"}
        if code not in formats:
            raise ValueError(f"Tipo primitivo desconhecido: {code}")
        return self.number(formats[code])

    def read(self):
        self.depth += 1
        if self.depth > 100:
            raise ValueError("Excesso de níveis")
        try:
            return self._read()
        finally:
            self.depth -= 1

    def _read(self):
        token = self.number("B")
        if token == 0x70:
            return None
        if token == 0x71:
            index = self.number("I") - 0x7E0000
            if not 0 <= index < len(self.handles):
                raise ValueError("Referência inválida")
            return self.handles[index]
        if token in (0x74, 0x7C):
            return self.register(self.utf(token == 0x7C))
        if token == 0x72:
            name, uid = self.utf(), self.number("q")
            desc = self.register({"name": name, "uid": uid, "fields": []})
            desc["flags"] = self.number("B")
            count = self.number("H")
            if count > 200:
                raise ValueError("Excesso de campos")
            for _ in range(count):
                kind, field = chr(self.number("B")), self.utf()
                signature = self.read() if kind in "L[" else None
                desc["fields"].append((kind, field, signature))
            desc["annotations"] = self.annotations()
            desc["super"] = self.read()
            return desc
        if token == 0x73:
            desc = self.read()
            if not isinstance(desc, dict) or "fields" not in desc:
                raise ValueError("Classe inválida")
            obj = self.register({"class": desc["name"], "fields": {}, "annotations": {}})
            hierarchy = []
            current = desc
            while current:
                if len(hierarchy) > 50 or any(item is current for item in hierarchy):
                    raise ValueError("Hierarquia de classes inválida")
                hierarchy.append(current)
                current = current["super"]
            for current in reversed(hierarchy):
                flags = current["flags"]
                if flags & 4:
                    if not flags & 8:
                        raise ValueError("Externalizable sem blocos não suportado")
                    obj["annotations"][current["name"]] = self.annotations()
                    continue
                if not flags & 2:
                    raise ValueError("Classe não serializável")
                for kind, field, _ in current["fields"]:
                    obj["fields"][field] = self.read() if kind in "L[" else self.primitive(kind)
                if flags & 1:
                    obj["annotations"][current["name"]] = self.annotations()
            return obj
        if token == 0x75:
            desc = self.read()
            if not isinstance(desc, dict) or not desc.get("name", "").startswith("["):
                raise ValueError("Tipo de array inválido")
            array = self.register({"array": desc["name"], "values": None})
            count = self.number("i")
            if not 0 <= count <= 2000000:
                raise ValueError("Tamanho de array inválido")
            kind = desc["name"][1]
            if kind == "B":
                array["values"] = self.take(count)
            elif kind in "L[":
                array["values"] = [self.read() for _ in range(count)]
            else:
                array["values"] = [self.primitive(kind) for _ in range(count)]
            return array
        if token in (0x77, 0x7A):
            return self.take(self.number("B" if token == 0x77 else "i"))
        if token == 0x7E:
            desc = self.read()
            value = self.register({"enum": desc["name"], "value": None})
            value["value"] = self.read()
            return value
        if token == 0x76:
            return self.register({"classObject": self.read()})
        raise ValueError(f"Token Java não suportado: {token:#x} na posição {self.offset - 1}")

    def root(self):
        value = self.read()
        if self.offset != len(self.data):
            raise ValueError(f"Dados extras após o objeto: {len(self.data) - self.offset} bytes")
        return value
