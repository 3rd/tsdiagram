import { expect, it } from "vitest";
import { Parser } from "./Parser";

it("parses code into AST and updates it on code change", () => {
  const parser = new Parser("interface A { }");
  expect(parser.interfaces.length).toBe(1);

  parser.setSource("interface A { }; interface B { }");
  expect(parser.interfaces.length).toBe(2);
});

it("parses interfaces", () => {
  const parser = new Parser(`
    interface A { foo: string; bar(): string; }
    interface B { baz: A; }
    interface C extends A, B { qux: string; }
  `);

  const interfaces = parser.interfaces;
  expect(interfaces.length).toBe(3);

  const [A, B, C] = interfaces;

  expect(A.name).toBe("A");
  expect(A.declaration.getText()).toBe("interface A { foo: string; bar(): string; }");
  expect(A.extends.length).toBe(0);
  expect(A.properties.length).toBe(1);
  expect(A.properties[0].getName()).toBe("foo");
  expect(A.methods.length).toBe(1);
  expect(A.methods[0].getName()).toBe("bar");

  expect(B.name).toBe("B");
  expect(B.declaration.getText()).toBe("interface B { baz: A; }");
  expect(B.extends.length).toBe(0);
  expect(B.properties.length).toBe(1);
  expect(B.properties[0].getName()).toBe("baz");
  expect(B.methods.length).toBe(0);

  expect(C.name).toBe("C");
  expect(C.declaration.getText()).toBe("interface C extends A, B { qux: string; }");
  expect(C.extends.length).toBe(2);
  expect(C.extends[0].getText()).toBe("A");
  expect(C.extends[1].getText()).toBe("B");
  expect(C.properties.length).toBe(3);
  expect(C.properties[0].getName()).toBe("qux");
  expect(C.properties[1].getName()).toBe("foo");
  expect(C.properties[2].getName()).toBe("baz");
  expect(C.methods.length).toBe(1);
  expect(C.methods[0].getName()).toBe("bar");
});

it("parses type aliases", () => {
  const parser = new Parser(`
    type A = { foo: string; bar(): string; };
    type B = { baz: A; };
    type C = A & B;
    type D = string;
  `);

  const typeAliases = parser.typeAliases;
  expect(typeAliases.length).toBe(4);
  const [A, B, C, D] = typeAliases;

  expect(A.name).toBe("A");
  expect(A.declaration.getText()).toBe("type A = { foo: string; bar(): string; };");
  expect(A.type.getText()).toBe("A");

  expect(B.name).toBe("B");
  expect(B.declaration.getText()).toBe("type B = { baz: A; };");
  expect(B.type.getText()).toBe("B");

  expect(C.name).toBe("C");
  expect(C.declaration.getText()).toBe("type C = A & B;");
  expect(C.type.getText()).toBe("C");

  expect(D.name).toBe("D");
  expect(D.declaration.getText()).toBe("type D = string;");
  expect(D.type.getText()).toBe("string");
});

it("parses classes", () => {
  const parser = new Parser(`
    class A { foo: string; }
    class B { bar(): string { throw new Error(); } }
    class C extends A implements B { bar() { return "baz"; } }
  `);

  const classes = parser.classes;
  expect(classes.length).toBe(3);

  const [A, B, C] = classes;

  expect(A.name).toBe("A");
  expect(A.declaration.getText()).toBe("class A { foo: string; }");
  expect(A.extends).toBeUndefined();
  expect(A.properties.length).toBe(1);
  expect(A.properties[0].getName()).toBe("foo");
  expect(A.methods.length).toBe(0);

  expect(B.name).toBe("B");
  expect(B.declaration.getText()).toBe("class B { bar(): string { throw new Error(); } }");
  expect(B.extends).toBeUndefined();
  expect(B.properties.length).toBe(0);
  expect(B.methods.length).toBe(1);
  expect(B.methods[0].getName()).toBe("bar");

  expect(C.name).toBe("C");
  expect(C.declaration.getText()).toBe('class C extends A implements B { bar() { return "baz"; } }');
  expect(C.extends).toBeDefined();
  expect(C.extends?.getText()).toBe("A");
  expect(C.properties.length).toBe(1);
  expect(C.methods.length).toBe(1);
});
